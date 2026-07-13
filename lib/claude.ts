import Anthropic from "@anthropic-ai/sdk";
import { formatMdBreakdown } from "./format";
import type { CrItemMatch } from "./types";

const MODEL = "claude-sonnet-5";

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
