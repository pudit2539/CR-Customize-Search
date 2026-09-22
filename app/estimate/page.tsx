"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Eye, FileSpreadsheet, Pencil, RotateCcw, Upload } from "lucide-react";
import ItemDetailModal from "@/components/ItemDetailModal";
import MdMatrix from "@/components/MdMatrix";
import Modal from "@/components/Modal";
import { MD_ROLE_LABEL, SOURCE_TYPE_LABEL } from "@/lib/format";
import { computeCostBreakdown, computeMdTotal, CORE_ROLES, DEFAULT_RATES, ratesMapFromEntries } from "@/lib/mdRates";
import type { CrItemMatch } from "@/lib/types";

// The MD-edit popup covers every current role plus the legacy combined
// "Dev Senior/Mgr" figure — pre-split items still carry it, and leaving it
// out of the popup would silently drop it from this quotation's override
// the moment someone opens and re-saves the popup.
const EDITABLE_ROLES = [...CORE_ROLES, "dev_senior_mgr"] as const;

const MODE_LABEL = SOURCE_TYPE_LABEL;

type SearchMode = "all" | "new_customer" | "existing_customer";

// Below this similarity the top match is probably not the same requirement —
// the row is flagged and excluded from the totals by default. Recalibrated
// 2026-07-24 after switching to voyage-3-large: genuinely unrelated queries
// against this corpus score ~33-40%, while real paraphrased matches (same
// requirement, different wording) commonly score 50-62% — the old 0.6 floor
// (carried over from the previous embedding model) was excluding correct
// matches by default. 0.48 sits safely above the noise ceiling.
const LOW_SIMILARITY = 0.48;

interface EstimateResult {
  requirement: string;
  matches: CrItemMatch[];
}

interface RowState {
  selectedIndex: number;
  included: boolean;
  // Manual per-role MD override — the reference case's MD breakdown is a
  // starting point, not a quote, so the estimator can be wrong for this
  // specific requirement. Never written back to the reference item's real
  // data — it only affects this quotation.
  mdOverride: Partial<Record<string, number>> | null;
}

function breakdownToDraft(breakdown: Partial<Record<string, number>> | null): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const role of EDITABLE_ROLES) {
    const v = breakdown?.[role];
    draft[role] = v == null ? "" : String(v);
  }
  return draft;
}

// Splits a pasted block (customer email / RFP) into one requirement per line,
// stripping common list prefixes: "1.", "1)", "-", "•", "*".
function splitRequirements(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]\s*|[-•*]\s*)/, "").trim())
    .filter((line) => line.length >= 4);
}

function similarityBadge(similarity: number) {
  if (similarity >= 0.6) return "bg-emerald-100 text-emerald-700";
  if (similarity >= LOW_SIMILARITY) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-600";
}

export default function EstimatePage() {
  const [mode, setMode] = useState<SearchMode>("all");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<EstimateResult[]>([]);
  const [rows, setRows] = useState<RowState[]>([]);
  const [detailItem, setDetailItem] = useState<CrItemMatch | null>(null);
  const [editingMdRow, setEditingMdRow] = useState<number | null>(null);
  const [mdDraft, setMdDraft] = useState<Record<string, string> | null>(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ customerName: "", customerAddress: "", contactPerson: "" });
  const [exportingQuote, setExportingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<string, number>>(DEFAULT_RATES);
  const docFileInput = useRef<HTMLInputElement>(null);
  const [extractingDoc, setExtractingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docGuidelines, setDocGuidelines] = useState<{ requirement: string; guideline: string | null }[]>([]);

  useEffect(() => {
    fetch("/api/settings/rates")
      .then((r) => r.json())
      .then((json) => json.entries?.length && setRates(ratesMapFromEntries(json.entries)));
  }, []);

  const parsedCount = useMemo(() => splitRequirements(text).length, [text]);

  // Doc-upload flow (feedback item 2.2): AI turns the uploaded file straight
  // into the same requirement-list text the textarea already understands —
  // everything downstream (search, default-selected matches) is unchanged.
  async function handleDocUpload(file: File) {
    setExtractingDoc(true);
    setDocError(null);
    setDocGuidelines([]);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/estimate/extract-doc", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "แยก requirement จากเอกสารไม่สำเร็จ");
      const extracted = json.requirements as { requirement: string; guideline: string | null }[];
      const lines = extracted.map((r) => r.requirement).join("\n");
      setText((prev) => (prev.trim() ? `${prev}\n${lines}` : lines));
      setDocGuidelines(extracted.filter((r) => r.guideline));
    } catch (e) {
      setDocError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtractingDoc(false);
      if (docFileInput.current) docFileInput.current.value = "";
    }
  }

  // The breakdown actually used for this row's MD/cost — the manual
  // override if the user edited it, otherwise the matched reference case's
  // own breakdown. Cost is always (re)computed from this × the current
  // rate card in Settings, never read from the reference item's stored
  // (historical) cost — per 2026-07-24 feedback, quotations should reflect
  // today's rates, not whatever rate was in effect when that old case was
  // priced.
  function effectiveBreakdown(i: number, match: CrItemMatch | null): Partial<Record<string, number>> | null {
    const row = rows[i];
    return row?.mdOverride ?? (match?.md_breakdown as Partial<Record<string, number>> | null) ?? null;
  }

  async function handleEstimate() {
    const requirements = splitRequirements(text);
    if (requirements.length === 0) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirements, mode: mode === "all" ? null : mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "estimate failed");
      const nextResults = json.results as EstimateResult[];
      setResults(nextResults);
      setRows(
        nextResults.map((r) => ({
          selectedIndex: 0,
          included: (r.matches[0]?.similarity ?? 0) >= LOW_SIMILARITY,
          mdOverride: null,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function setRow(i: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function handleExportQuote() {
    if (!quoteForm.customerName.trim()) {
      setQuoteError("กรุณากรอกชื่อลูกค้า");
      return;
    }
    setExportingQuote(true);
    setQuoteError(null);
    try {
      const items = results
        .map((r, i) => {
          const row = rows[i];
          const match = r.matches[row?.selectedIndex ?? 0];
          if (!row?.included || !match) return null;
          const breakdown = effectiveBreakdown(i, match);
          return {
            description: r.requirement,
            md: computeMdTotal(breakdown),
            amount: computeCostBreakdown(breakdown, rates).total,
            mdBreakdown: breakdown,
          };
        })
        .filter(
          (x): x is { description: string; md: number; amount: number; mdBreakdown: Partial<Record<string, number>> | null } =>
            x !== null
        );

      const res = await fetch("/api/quote/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...quoteForm, items }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "สร้างใบเสนอราคาไม่สำเร็จ");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PINNO_Quotation_${quoteForm.customerName.replace(/[^a-zA-Z0-9]+/g, "_")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setShowQuoteModal(false);
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportingQuote(false);
    }
  }

  const totals = useMemo(() => {
    let md = 0;
    let cost = 0;
    let counted = 0;
    results.forEach((r, i) => {
      const row = rows[i];
      const match = r.matches[row?.selectedIndex ?? 0];
      if (!row?.included || !match) return;
      counted++;
      const breakdown = effectiveBreakdown(i, match);
      md += computeMdTotal(breakdown);
      cost += computeCostBreakdown(breakdown, rates).total;
    });
    // Round away binary floating-point residue from summing decimal MDs.
    return { md: Math.round(md * 100) / 100, cost, counted };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, rows, rates]);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="page-header">
        <span className="icon-badge h-11 w-11 shrink-0">
          <Calculator size={20} />
        </span>
        <div>
          <h1>Create Quotation</h1>
          <p>
            วาง requirement หลายข้อพร้อมกัน (1 บรรทัด = 1 ข้อ) ระบบจะค้นหาเคสอ้างอิงให้ทีละข้อ
            แล้วสรุปเป็นตาราง MD/Cost รวม
          </p>
        </div>
      </div>

      <div className="mt-6 inline-flex rounded-full border border-zinc-200 bg-white p-1">
        {(["all", "new_customer", "existing_customer"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === m ? "bg-[var(--brand)] text-white" : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {m === "all" ? "ทั้งหมด" : MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "วาง requirement จาก email ลูกค้าได้เลย เช่น:\n1. คำนวณ OT แยกตามกะการทำงาน\n2. Carry forward วันลาพักร้อนไม่เกิน 5 วัน\n3. เพิ่ม approval ตามสายบังคับบัญชา"
          }
          rows={7}
          className="w-full resize-none rounded-lg border border-zinc-300 bg-white p-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={handleEstimate}
            disabled={loading || parsedCount === 0}
            className="btn btn-primary"
          >
            {loading ? "กำลังประเมิน..." : `ประเมินทั้งชุด (${parsedCount} ข้อ)`}
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            <Upload size={15} />
            {extractingDoc ? "AI กำลังอ่านเอกสาร..." : "อัปโหลดเอกสาร requirement จากลูกค้า"}
            <input
              ref={docFileInput}
              type="file"
              accept=".docx,.xlsx,.pdf"
              className="hidden"
              disabled={extractingDoc}
              onChange={(e) => e.target.files?.[0] && handleDocUpload(e.target.files[0])}
            />
          </label>
          {parsedCount > 30 && (
            <span className="text-xs text-red-500">รองรับสูงสุด 30 ข้อต่อครั้ง</span>
          )}
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          รองรับ .docx / .xlsx / .pdf — AI จะแยกเป็น requirement รายข้อแล้วเติมลงกล่องข้อความด้านบนให้ ตรวจ/แก้ก่อนกด &quot;ประเมินทั้งชุด&quot;
        </p>
      </div>

      {docError && <p className="mt-3 text-sm text-red-600">เกิดข้อผิดพลาด: {docError}</p>}

      {docGuidelines.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-medium">AI ตั้งข้อสังเกตจากเอกสาร (ควรตรวจก่อนประเมิน):</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {docGuidelines.map((g, i) => (
              <li key={i}>
                <span className="font-medium">{g.requirement}</span> — {g.guideline}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">เกิดข้อผิดพลาด: {error}</p>}

      {loading && (
        <div className="mt-8 space-y-3">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            กำลังค้นหาเคสอ้างอิงทีละข้อ...
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm shadow-zinc-200/60">
              <div className="h-3 w-3/4 rounded bg-zinc-200" />
              <div className="mt-3 h-3 w-1/2 rounded bg-zinc-100" />
            </div>
          ))}
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-500">พบเคสอ้างอิงสำหรับ {results.length} ข้อ</p>
          <button
            onClick={() => setShowQuoteModal(true)}
            disabled={totals.counted === 0}
            className="btn btn-primary"
          >
            <FileSpreadsheet size={15} />
            สร้างใบเสนอราคา (Excel)
          </button>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="mt-3 surface-card p-3 sm:overflow-x-auto sm:p-0">
          <table className="table-responsive w-full text-left text-sm">
            <thead className="text-xs text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">รวม</th>
                <th className="px-4 py-3 font-medium">Requirement</th>
                <th className="px-4 py-3 font-medium">เคสอ้างอิง</th>
                <th className="px-4 py-3 font-medium">ใกล้เคียง</th>
                <th className="px-4 py-3 font-medium text-right">MD</th>
                <th className="px-4 py-3 font-medium text-right">Cost</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const row = rows[i];
                const match = r.matches[row?.selectedIndex ?? 0] ?? null;
                const lowConfidence = (match?.similarity ?? 0) < LOW_SIMILARITY;
                return (
                  <tr key={i} className="border-t border-zinc-100 align-top hover:bg-zinc-50/60">
                    <td data-label="รวม" className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={row?.included ?? false}
                        disabled={!match}
                        onChange={(e) => setRow(i, { included: e.target.checked })}
                      />
                    </td>
                    <td data-label="Requirement" className="max-w-xs px-4 py-3">
                      <p className="whitespace-pre-wrap text-zinc-800">{r.requirement}</p>
                      {lowConfidence && (
                        <p className="mt-1 text-xs text-amber-600">
                          ไม่พบเคสที่ใกล้เคียงพอ — ควรประเมินข้อนี้เอง
                        </p>
                      )}
                    </td>
                    <td data-label="เคสอ้างอิง" className="max-w-sm px-4 py-3">
                      {r.matches.length === 0 ? (
                        <span className="text-zinc-400">ไม่พบ</span>
                      ) : (
                        <>
                          <select
                            value={row?.selectedIndex ?? 0}
                            onChange={(e) => setRow(i, { selectedIndex: Number(e.target.value), mdOverride: null })}
                            className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700"
                          >
                            {r.matches.map((m, mi) => (
                              <option key={m.id} value={mi}>
                                [{(m.similarity * 100).toFixed(0)}%] [{m.module ?? "-"}]{" "}
                                {m.detail.slice(0, 60)}
                              </option>
                            ))}
                          </select>
                          {match && (
                            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                              {MODE_LABEL[match.source_type]} · {match.project ?? "-"}
                            </p>
                          )}
                        </>
                      )}
                    </td>
                    <td data-label="ใกล้เคียง" className="px-4 py-3 whitespace-nowrap">
                      {match && (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${similarityBadge(match.similarity)}`}
                        >
                          {(match.similarity * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td data-label="MD" className="px-4 py-3 text-right text-zinc-700">
                      {match && (
                        <div className="flex flex-col items-end gap-1">
                          <button
                            onClick={() => {
                              setMdDraft(breakdownToDraft(effectiveBreakdown(i, match)));
                              setEditingMdRow(i);
                            }}
                            className="inline-flex items-center gap-1 hover:text-zinc-900"
                            title="แก้ไข MD แยกตาม level (ไม่กระทบข้อมูลจริงของเคสอ้างอิง)"
                          >
                            <span className={row?.mdOverride != null ? "font-medium text-amber-700" : "font-medium"}>
                              {computeMdTotal(effectiveBreakdown(i, match)) || "-"} MD
                            </span>
                            <Pencil size={11} className="text-zinc-400" />
                          </button>
                          <MdMatrix breakdown={effectiveBreakdown(i, match)} />
                        </div>
                      )}
                    </td>
                    <td data-label="Cost" className="px-4 py-3 text-right whitespace-nowrap text-zinc-700">
                      {match &&
                        (() => {
                          const cost = computeCostBreakdown(effectiveBreakdown(i, match), rates).total;
                          return (
                            <>
                              {cost ? cost.toLocaleString() : "-"}
                              {match.cost == null && (
                                <p className="text-[10px] font-normal text-amber-600">ไม่มีราคา STD ในเคสอ้างอิง</p>
                              )}
                            </>
                          );
                        })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {match && (
                        <button
                          onClick={() => setDetailItem(match)}
                          title="ดูรายละเอียดเคสอ้างอิง"
                          className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50"
                        >
                          <Eye size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-medium text-zinc-900">
                <td className="px-4 py-3" colSpan={4}>
                  รวม {totals.counted} ข้อที่เลือก
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    (MD จากเคสอ้างอิง × อัตราปัจจุบันในหน้าตั้งค่า — ใช้เป็นแนวทางตั้งต้น ไม่ใช่ราคาเสนอจริง)
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{totals.md} MD</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {totals.cost.toLocaleString()}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {detailItem && <ItemDetailModal item={detailItem} onClose={() => setDetailItem(null)} />}

      {editingMdRow !== null && mdDraft && (
        <Modal title="แก้ไข MD แยกตาม level" onClose={() => setEditingMdRow(null)}>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-zinc-500">
              แก้เฉพาะใบเสนอราคานี้ — ไม่กระทบข้อมูลจริงของเคสอ้างอิงในระบบ
            </p>
            <div className="grid grid-cols-2 gap-2">
              {EDITABLE_ROLES.map((role) => (
                <label key={role} className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500">{MD_ROLE_LABEL[role]}</span>
                  <input
                    type="number"
                    value={mdDraft[role]}
                    onChange={(e) => setMdDraft((d) => (d ? { ...d, [role]: e.target.value } : d))}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-2 border-t border-zinc-100 pt-4">
              <button
                onClick={() => {
                  const parsed: Partial<Record<string, number>> = {};
                  for (const role of EDITABLE_ROLES) {
                    const n = Number(mdDraft[role]);
                    if (mdDraft[role].trim() !== "" && !Number.isNaN(n)) parsed[role] = n;
                  }
                  setRow(editingMdRow, { mdOverride: parsed });
                  setEditingMdRow(null);
                }}
                className="rounded-lg bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--brand-dark)]"
              >
                บันทึก
              </button>
              <button
                onClick={() => {
                  setRow(editingMdRow, { mdOverride: null });
                  setEditingMdRow(null);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                <RotateCcw size={13} />
                ใช้ค่าจากเคสอ้างอิง
              </button>
              <button
                onClick={() => setEditingMdRow(null)}
                className="rounded-lg border border-zinc-200 px-5 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showQuoteModal && (
        <Modal title="สร้างใบเสนอราคา" onClose={() => setShowQuoteModal(false)}>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-zinc-500">
              จะรวม {totals.counted} ข้อที่เลือกไว้ ({totals.md} MD) เป็นใบเสนอราคา Excel ตาม template ของ PINNO
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-500">ชื่อลูกค้า *</span>
              <input
                value={quoteForm.customerName}
                onChange={(e) => setQuoteForm((f) => ({ ...f, customerName: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                placeholder="เช่น ABC Company Limited"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-500">ที่อยู่ (ไม่บังคับ)</span>
              <input
                value={quoteForm.customerAddress}
                onChange={(e) => setQuoteForm((f) => ({ ...f, customerAddress: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-zinc-500">ผู้ติดต่อ (ไม่บังคับ)</span>
              <input
                value={quoteForm.contactPerson}
                onChange={(e) => setQuoteForm((f) => ({ ...f, contactPerson: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </label>

            {quoteError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{quoteError}</p>}

            <div className="flex gap-2 border-t border-zinc-100 pt-4">
              <button
                onClick={handleExportQuote}
                disabled={exportingQuote}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
              >
                <FileSpreadsheet size={15} />
                {exportingQuote ? "กำลังสร้าง..." : "ดาวน์โหลด Excel"}
              </button>
              <button
                onClick={() => setShowQuoteModal(false)}
                className="rounded-lg border border-zinc-200 px-5 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
