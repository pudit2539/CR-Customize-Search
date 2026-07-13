import Anthropic from "@anthropic-ai/sdk";
import { formatMdBreakdown } from "./format";
import type { CrItemMatch, MdBreakdown, SourceType } from "./types";

const MODEL = "claude-sonnet-5";

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
  dev_senior_mgr: { type: "number", description: "Dev Senior & Manager mandays" },
  manager: { type: "number", description: "Manager mandays" },
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

export async function extractItems(text: string): Promise<ExtractedItemDraft[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "disabled" },
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_items" },
    messages: [
      {
        role: "user",
        content: `แยก requirement ของ CR/Customize จากข้อความนี้ออกมาเป็น item(s) (อาจมีมากกว่า 1 รายการถ้าข้อความนี้พูดถึงหลาย requirement):\n\n"""\n${text}\n"""\n\nสำคัญมาก: ห้ามเดาหรือประมาณตัวเลข MD/cost เอง — ใส่เฉพาะตัวเลขที่ระบุไว้ตรงๆในข้อความเท่านั้น ถ้าข้อความไม่ได้บอกตัวเลข ให้ไม่ต้องใส่ field นั้นเลย`,
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use" && b.name === "extract_items");
  if (!toolUse || toolUse.type !== "tool_use") return [];

  const input = toolUse.input as { items?: Partial<ExtractedItemDraft>[] };
  return (input.items ?? []).map((item) => ({
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

export async function synthesizeMatches(query: string, matches: CrItemMatch[]): Promise<string> {
  if (matches.length === 0) return "ไม่พบเคสเก่าที่ใกล้เคียง — น่าจะต้องประเมิน MD ใหม่ทั้งหมด";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const context = matches
    .slice(0, 5)
    .map(
      (m, i) =>
        `${i + 1}. [${m.module ?? "-"}] ${m.detail}\n   MD breakdown: ${formatMdBreakdown(m.md_breakdown)} (รวม ${m.md_summary ?? "-"} MD), Cost: ${m.cost ?? "-"}, Project: ${m.project ?? "-"}, Similarity: ${(m.similarity * 100).toFixed(0)}%`
    )
    .join("\n");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
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
  return textBlock?.type === "text" ? textBlock.text : "";
}
