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
