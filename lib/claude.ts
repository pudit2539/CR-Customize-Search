import Anthropic from "@anthropic-ai/sdk";
import type { DocInput } from "./docParse";
import { formatMdBreakdown } from "./format";
import type { CrItemMatch, MdBreakdown, SourceType } from "./types";

const MODEL = "claude-sonnet-5";

// Builds the user-turn content for a doc-based extraction call — PDFs go in
// as a native document block (Claude reads them directly, including scanned
// pages), text goes in as a plain instruction + the extracted text.
function docContent(doc: DocInput, instruction: string): Anthropic.Messages.MessageParam["content"] {
  if ("pdfBase64" in doc) {
    return [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.pdfBase64 } },
      { type: "text", text: instruction },
    ];
  }
  return `${instruction}\n\n"""\n${doc.text}\n"""`;
}

// Empirically, some tool-call responses come back with an array field
// double-encoded as a JSON string (e.g. `{ requirements: "[{...}]" }`
// instead of `{ requirements: [{...}] }`) rather than the native array the
// schema declares — reproduced consistently against claude-sonnet-5 for one
// schema shape and not another, so this parses defensively for every
// tool-call field read in this file instead of trusting either shape.
function parseToolArrayField<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as T[];
      // The observed failure mode wraps the *whole* payload as a string
      // under the same key, e.g. requirements: '{"requirements":[...]}'.
      if (parsed && typeof parsed === "object") {
        const nested = Object.values(parsed).find((v) => Array.isArray(v));
        if (nested) return nested as T[];
      }
    } catch {
      // fall through to empty
    }
  }
  return [];
}

export interface ExtractedItemDraft {
  source_type_guess: SourceType;
  module: string | null;
  detail: string;
  project: string | null;
  industry: string | null;
  remark: string | null;
  cost: number | null;
  md_breakdown: Partial<MdBreakdown>;
}

const MD_ROLE_PROPERTIES = {
  fun_junior: { type: "number", description: "Fun/Functional Junior mandays" },
  fun_consultant: { type: "number", description: "Fun/Functional Consultant mandays" },
  fun_senior: { type: "number", description: "Fun/Functional Senior mandays" },
  dev_consultant: { type: "number", description: "Dev Consultant mandays" },
  dev_senior: { type: "number", description: "Dev Senior mandays (dev work needing solution design, not just coding to a clear spec)" },
  dev_manager: { type: "number", description: "Dev Manager mandays (Manager-Product tier — dev-side project/solution management, distinct from the general project Manager role)" },
  manager: { type: "number", description: "Manager mandays (PM time spent on project management/customer meetings)" },
} as const;

const EXTRACT_TOOL = {
  name: "extract_items",
  description: "Extract one or more CR/Customize requirement items from free-form text.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source_type_guess: {
              type: "string",
              enum: ["new_customer", "existing_customer"],
              description: "Best guess: new_customer if this reads like a presale estimate for a brand-new client, existing_customer if it's a change request for a client already live.",
            },
            module: { type: "string", description: "Short module code if mentioned or obviously inferable, e.g. TM, BN, PY, WF" },
            detail: { type: "string", description: "The requirement text itself, cleaned up but not summarized away" },
            project: { type: "string", description: "Customer/project name(s), only if stated" },
            industry: { type: "string", description: "Industry, only if stated" },
            remark: { type: "string", description: "Any extra context/caveats mentioned" },
            cost: { type: "number", description: "Only if an explicit cost figure is stated in the text" },
            md_breakdown: {
              type: "object",
              description: "Only include a role if the text explicitly states a mandays number for it. Never guess or estimate a number that isn't in the source text.",
              properties: MD_ROLE_PROPERTIES,
            },
          },
          required: ["detail"],
        },
      },
    },
    required: ["items"],
  },
};

export async function extractItems(doc: DocInput): Promise<ExtractedItemDraft[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  // Explicit timeout so a slow response fails fast with a clear error
  // instead of hanging until the platform's own function timeout kills it;
  // maxRetries covers transient 429/5xx (this matches the SDK's own
  // default, made explicit so it doesn't silently drift on a future
  // SDK upgrade).
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });

  const instruction =
    "แยก requirement ของ CR/Customize จากเอกสาร/ข้อความนี้ออกมาเป็น item(s) (อาจมีมากกว่า 1 รายการถ้าพูดถึงหลาย requirement)\n\nสำคัญมาก: ห้ามเดาหรือประมาณตัวเลข MD/cost เอง — ใส่เฉพาะตัวเลขที่ระบุไว้ตรงๆในเอกสารเท่านั้น ถ้าไม่ได้บอกตัวเลข ให้ไม่ต้องใส่ field นั้นเลย";

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "disabled" },
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_items" },
    messages: [{ role: "user", content: docContent(doc, instruction) }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use" && b.name === "extract_items");
  if (!toolUse || toolUse.type !== "tool_use") return [];

  const input = toolUse.input as { items?: unknown };
  return parseToolArrayField<Partial<ExtractedItemDraft>>(input.items).map((item) => ({
    source_type_guess: item.source_type_guess ?? "new_customer",
    module: item.module ?? null,
    detail: item.detail ?? "",
    project: item.project ?? null,
    industry: item.industry ?? null,
    remark: item.remark ?? null,
    cost: item.cost ?? null,
    md_breakdown: item.md_breakdown ?? {},
  }));
}

export interface ExtractedRequirement {
  requirement: string;
  guideline: string | null;
}

const REQUIREMENTS_TOOL = {
  name: "extract_requirements",
  description:
    "Extract a list of discrete customer requirements from a document, each rewritten as one clear line suitable for searching a knowledge base of past CR/Customize cases.",
  input_schema: {
    type: "object" as const,
    properties: {
      requirements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            requirement: {
              type: "string",
              description: "One requirement, rewritten clearly and concisely (keep the source language, Thai or English)",
            },
            guideline: {
              type: "string",
              description: "Optional short note on complexity/ambiguity for this requirement, only if something about it genuinely needs flagging",
            },
          },
          required: ["requirement"],
        },
      },
    },
    required: ["requirements"],
  },
};

// Create Quotation's document-upload flow (feedback item 2.2): presale
// uploads a customer requirement doc, this turns it into a plain
// requirement list that slots into the exact same textarea/parsing path as
// pasting text by hand — everything downstream (search, default-selected
// matches, MD editing) stays unchanged.
export async function extractRequirementsFromDocument(doc: DocInput): Promise<ExtractedRequirement[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  const instruction =
    "แยก requirement ของลูกค้าจากเอกสารนี้ออกมาเป็นรายการ แต่ละรายการควรเป็น requirement เดียวที่ชัดเจน กระชับ พร้อมใช้ค้นหาในระบบ (ไม่ต้องสรุปรวมหลาย requirement เข้าด้วยกัน)";

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    thinking: { type: "disabled" },
    tools: [REQUIREMENTS_TOOL],
    tool_choice: { type: "tool", name: "extract_requirements" },
    messages: [{ role: "user", content: docContent(doc, instruction) }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use" && b.name === "extract_requirements");
  if (!toolUse || toolUse.type !== "tool_use") return [];

  const input = toolUse.input as { requirements?: unknown };
  return parseToolArrayField<Partial<ExtractedRequirement>>(input.requirements)
    .map((r) => ({ requirement: r.requirement?.trim() ?? "", guideline: r.guideline?.trim() || null }))
    .filter((r) => r.requirement.length > 0);
}

export async function synthesizeMatches(query: string, matches: CrItemMatch[]): Promise<string> {
  if (matches.length === 0) return "ไม่พบเคสเก่าที่ใกล้เคียง — น่าจะต้องประเมิน MD ใหม่ทั้งหมด";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });

  const context = matches
    .slice(0, 5)
    .map(
      (m, i) =>
        `${i + 1}. [${m.module ?? "-"}] ${m.detail}\n   MD breakdown: ${formatMdBreakdown(m.md_breakdown)} (รวม ${m.md_summary ?? "-"} MD), Cost: ${m.cost ?? "-"}, Project: ${m.project ?? "-"}, Similarity: ${(m.similarity * 100).toFixed(0)}%`
    )
    .join("\n");

  const message = await client.messages.create({
    model: MODEL,
    // 400, then 800, both still got cut off mid-sentence once Claude
    // compares several matches' per-role MD breakdowns (as asked below) —
    // Thai text runs more tokens per character than English on top of that.
    // 1500 gives real headroom; the truncation note below is the backstop
    // if a response is unusually long anyway.
    max_tokens: 1500,
    // This is a short, non-reasoning summary task — disable extended
    // thinking so its token budget doesn't eat into max_tokens and leave
    // nothing for the actual answer.
    thinking: { type: "disabled" },
    messages: [
      {
        role: "user",
        content: `Requirement ใหม่ที่ presale/PM พิมพ์มา:\n"${query}"\n\nรายการ CR/Customize เก่าที่ระบบค้นหาเจอว่าใกล้เคียงที่สุด:\n${context}\n\nช่วยเขียนสรุปสั้นๆ เป็นภาษาไทย (ไม่เกิน 4-5 บรรทัด) บอกว่ารายการไหนใกล้เคียงที่สุดและเพราะอะไร, MD ที่แนะนำให้ใช้เป็นจุดตั้งต้นประมาณเท่าไหร่ — ระบุด้วยว่า MD นั้นมาจากระดับไหนบ้าง (เช่น Fun Senior, Dev Consultant) ไม่ใช่แค่ตัวเลขรวม ถ้าไม่มีอะไรใกล้เคียงจริงๆให้บอกตรงๆว่าต้องประเมินใหม่`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";
  // Surface truncation instead of silently showing a sentence that trails
  // off mid-word — better an honest note than text that reads as complete
  // but isn't.
  return message.stop_reason === "max_tokens" ? `${text}\n\n(สรุปถูกตัดเพราะยาวเกินไป)` : text;
}
