-- Run this once in the Supabase SQL editor for the project.
create extension if not exists vector;

create table if not exists cr_items (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('new_customer', 'existing_customer')),
  item_no int,
  module text,
  detail text not null,
  md_breakdown jsonb,
  md_summary numeric,
  cost numeric,
  project text,
  industry text,
  check_note text,
  priority text,
  remark text,
  timeline_followup text,
  presale_note text,
  embedding vector(512),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upsert key used by the importer: same (source_type, item_no) = same item.
create unique index if not exists cr_items_source_no_key
  on cr_items (source_type, item_no)
  where item_no is not null;

create index if not exists cr_items_embedding_idx
  on cr_items using hnsw (embedding vector_cosine_ops);

-- Similarity search RPC: cosine distance via pgvector's `<=>` operator.
-- filter_source_type narrows to one sheet (new_customer / existing_customer)
-- when the caller picked a mode; pass null to search across both.
create or replace function match_cr_items(
  query_embedding vector(512),
  match_count int default 10,
  filter_source_type text default null
)
returns table (
  id uuid,
  source_type text,
  item_no int,
  module text,
  detail text,
  md_breakdown jsonb,
  md_summary numeric,
  cost numeric,
  project text,
  industry text,
  check_note text,
  priority text,
  remark text,
  timeline_followup text,
  presale_note text,
  similarity float
)
language sql stable
as $$
  select
    id, source_type, item_no, module, detail, md_breakdown, md_summary, cost,
    project, industry, check_note, priority, remark, timeline_followup, presale_note,
    1 - (embedding <=> query_embedding) as similarity
  from cr_items
  where embedding is not null
    and (filter_source_type is null or source_type = filter_source_type)
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Search history: one row per search, so the team can look back at what was
-- searched and what the top result was.
create table if not exists search_logs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  mode text,
  result_count int not null default 0,
  top_match_id uuid references cr_items(id) on delete set null,
  top_similarity float,
  synthesis text,
  created_at timestamptz not null default now()
);

create index if not exists search_logs_created_at_idx on search_logs (created_at desc);

-- Item change log: audit trail for every insert/update/delete on cr_items,
-- from both the manual /items UI and bulk /import. No login yet, so there's
-- no "changed by" — just what changed and when.
create table if not exists cr_item_changes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid,
  action text not null check (action in ('insert', 'update', 'delete', 'import_insert', 'import_update')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cr_item_changes_created_at_idx on cr_item_changes (created_at desc);

-- Now that logins exist (admin/demo accounts), attribute each log entry to
-- the username that made it.
alter table search_logs add column if not exists created_by text;
alter table cr_item_changes add column if not exists created_by text;

-- MD rate card, editable in /settings. Seeded with the rates that were
-- previously only hardcoded in lib/parseExcel.ts / the Excel file's own
-- header rows. Changing a rate here never rewrites cost already stored on
-- existing cr_items rows — it only feeds new-item cost suggestions and the
-- informational breakdown shown in the item detail modal.
create table if not exists md_rates (
  role text primary key check (
    role in ('fun_junior', 'fun_consultant', 'fun_senior', 'dev_consultant', 'dev_senior_mgr', 'manager')
  ),
  rate numeric not null,
  updated_at timestamptz not null default now()
);

insert into md_rates (role, rate) values
  ('fun_junior', 2400),
  ('fun_consultant', 4800),
  ('fun_senior', 6000),
  ('dev_consultant', 4800),
  ('dev_senior_mgr', 7000),
  ('manager', 8000)
on conflict (role) do nothing;

-- Private bucket for the original Excel files uploaded via /import, so the
-- team can download the source document a CR item came from, not just the
-- extracted fields.
insert into storage.buckets (id, name, public)
values ('import-files', 'import-files', false)
on conflict (id) do nothing;

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  uploaded_by text,
  item_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Nullable: manually-added and AI-extracted items have no source file, and
-- rows imported before this feature existed have nothing to backfill to.
alter table cr_items add column if not exists import_batch_id uuid references import_batches(id) on delete set null;

-- Re-declare match_cr_items to also surface which file (if any) an item came
-- from, so search results can offer a "download original file" link without
-- an extra round trip.
-- Also drops a stray 2-arg overload left over from before filter_source_type
-- was added (an early `create or replace` used a different signature, so it
-- never actually replaced the original — Postgres just kept both). The app
-- always calls with all 3 named args so it was never affected, but a bare
-- 2-arg call is ambiguous between the two and should only ever match one.
drop function if exists match_cr_items(vector, int);
drop function if exists match_cr_items(vector, int, text);

create function match_cr_items(
  query_embedding vector(512),
  match_count int default 10,
  filter_source_type text default null
)
returns table (
  id uuid,
  source_type text,
  item_no int,
  module text,
  detail text,
  md_breakdown jsonb,
  md_summary numeric,
  cost numeric,
  project text,
  industry text,
  check_note text,
  priority text,
  remark text,
  timeline_followup text,
  presale_note text,
  import_batch_id uuid,
  source_filename text,
  similarity float
)
language sql stable
as $$
  select
    cr.id, cr.source_type, cr.item_no, cr.module, cr.detail, cr.md_breakdown,
    cr.md_summary, cr.cost, cr.project, cr.industry, cr.check_note, cr.priority,
    cr.remark, cr.timeline_followup, cr.presale_note, cr.import_batch_id,
    ib.filename as source_filename,
    1 - (cr.embedding <=> query_embedding) as similarity
  from cr_items cr
  left join import_batches ib on ib.id = cr.import_batch_id
  where cr.embedding is not null
    and (filter_source_type is null or cr.source_type = filter_source_type)
  order by cr.embedding <=> query_embedding
  limit match_count;
$$;

-- ===== MD rate master data (v2) =====
-- md_rates becomes an editable master table: human labels, editor
-- attribution, and a full audit trail in md_rate_changes. The 6 original
-- roles still feed cost suggestions (ItemForm / detail modal); rows added
-- beyond those are reference-only and can be deleted freely.
alter table md_rates drop constraint if exists md_rates_role_check;
alter table md_rates add column if not exists label text;
alter table md_rates add column if not exists updated_by text;

create table if not exists md_rate_changes (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  action text not null check (action in ('insert', 'update', 'delete', 'import')),
  before jsonb,
  after jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

update md_rates set label = v.label
from (values
  ('fun_junior', 'Functional - Junior'),
  ('fun_consultant', 'Functional - Consultant'),
  ('fun_senior', 'Functional - Senior'),
  ('dev_consultant', 'Dev - Consultant'),
  ('dev_senior_mgr', 'Dev - Senior/Manager'),
  ('manager', 'Project Manager (Manager-Im)')
) as v(role, label)
where md_rates.role = v.role and md_rates.label is null;

-- ===== STD candidate export (feature #4 from the original roadmap) =====
-- A lightweight nomination list: any logged-in user can flag a cr_items row
-- as worth reviewing for standardization, with a short note on why. The
-- actual STD/reject decision happens offline (พี่ยอด/พี่แชมป์ reply inside
-- the exported Excel) — this table only tracks who nominated what and why,
-- not the outcome.
create table if not exists std_candidates (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references cr_items(id) on delete cascade,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (item_id)
);

-- ===== Embedding model upgrade: voyage-3-lite -> voyage-3-large =====
-- Paraphrase testing showed voyage-3-lite (512-dim) gave weak separation
-- between genuinely related paraphrased requirements and unrelated ones
-- (~35-65% vs a ~30% unrelated baseline). voyage-3-large (1024-dim) scored
-- noticeably higher on the same paraphrase pairs with the same baseline,
-- so it's worth the migration + full re-embed.
drop index if exists cr_items_embedding_idx;
alter table cr_items alter column embedding type vector(1024) using null;
create index cr_items_embedding_idx on cr_items using hnsw (embedding vector_cosine_ops);

drop function if exists match_cr_items(vector, int, text);

create function match_cr_items(
  query_embedding vector(1024),
  match_count int default 10,
  filter_source_type text default null
)
returns table (
  id uuid,
  source_type text,
  item_no int,
  module text,
  detail text,
  md_breakdown jsonb,
  md_summary numeric,
  cost numeric,
  project text,
  industry text,
  check_note text,
  priority text,
  remark text,
  timeline_followup text,
  presale_note text,
  import_batch_id uuid,
  source_filename text,
  similarity float
)
language sql stable
as $$
  select
    cr.id, cr.source_type, cr.item_no, cr.module, cr.detail, cr.md_breakdown,
    cr.md_summary, cr.cost, cr.project, cr.industry, cr.check_note, cr.priority,
    cr.remark, cr.timeline_followup, cr.presale_note, cr.import_batch_id,
    ib.filename as source_filename,
    1 - (cr.embedding <=> query_embedding) as similarity
  from cr_items cr
  left join import_batches ib on ib.id = cr.import_batch_id
  where cr.embedding is not null
    and (filter_source_type is null or cr.source_type = filter_source_type)
  order by cr.embedding <=> query_embedding
  limit match_count;
$$;

-- ===== Split "Dev Senior & Mgr" into separate Dev Senior / Dev Manager rates =====
-- Was one blended rate (7,350, not on the real rate card). Per 2026-07-24
-- feedback: Dev Senior should track the same tier as Fun Senior (6,300), Dev
-- Manager should be its own tier (Manager-Product, 9,450). The old
-- dev_senior_mgr role/rate row is kept (relabeled, no longer "core") so
-- existing history/data isn't lost — cr_items.md_breakdown rows written
-- before this migration keep their combined figure under that key.
insert into md_rates (role, label, rate) values
  ('dev_senior', 'Dev - Senior', 6300),
  ('dev_manager', 'Dev - Manager (Manager-Product)', 9450)
on conflict (role) do nothing;

update md_rates set label = 'Dev - Senior/Manager (เดิม, เลิกใช้)'
where role = 'dev_senior_mgr' and label is distinct from 'Dev - Senior/Manager (เดิม, เลิกใช้)';

-- ===== Lightweight match-confirmation feedback loop =====
-- Practical answer to "the system should get smarter from usage" (feedback
-- item 7.3): there's no model fine-tuning pipeline here, so instead the app
-- lets users confirm a search/estimate match was actually correct, and
-- rerank.ts uses the accumulated count as a small ranking boost — frequently
-- confirmed items surface a little higher over time.
create table if not exists match_feedback (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references cr_items(id) on delete cascade,
  query text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists match_feedback_item_id_idx on match_feedback (item_id);
