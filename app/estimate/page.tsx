"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Eye, FileSpreadsheet, Pencil, RotateCcw, Upload } from "lucide-react";
import ItemDetailModal from "@/components/ItemDetailModal";
import MdMatrix from "@/components/MdMatrix";
import Modal from "@/components/Modal";
import SegmentedControl from "@/components/SegmentedControl";
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
  if (similarity >= 0.6) return "badge-success";
  if (similarity >= LOW_SIMILARITY) return "badge-warn";
  return "badge-danger";
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
    // Best-effort — DEFAULT_RATES (the initial state) already covers the
    // case where this fails, so a fetch/parse error here just means the
    // estimate uses the built-in defaults instead of the live rate card.
    fetch("/api/settings/rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => json?.entries?.length && setRates(ratesMapFromEntries(json.entries)))
      .catch(() => {});
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
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

      <div className="mt-6">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "all", label: "ทั้งหมด" },
            { value: "new_customer", label: MODE_LABEL.new_customer },
            { value: "existing_customer", label: MODE_LABEL.existing_customer },
          ]}
        />
      </div>

      {/* Input panel: one card holding the textarea and its toolbar */}
      <div className="surface-card mt-4 overflow-hidden">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            "วาง requirement จาก email ลูกค้าได้เลย เช่น:\n1. คำนวณ OT แยกตามกะการทำงาน\n2. Carry forward วันลาพักร้อนไม่เกิน 5 วัน\n3. เพิ่ม approval ตามสายบังคับบัญชา"
          }
          rows={7}
          className="block w-full resize-none border-0 bg-transparent p-4 text-sm leading-6 outline-none placeholder:text-slate-400"
        />
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] bg-slate-50/60 px-4 py-3">
          <button onClick={handleEstimate} disabled={loading || parsedCount === 0} className="btn btn-primary">
            <Calculator size={15} />
            {loading ? "กำลังประเมิน..." : `ประเมินทั้งชุด (${parsedCount} ข้อ)`}
          </button>
          <label className="btn btn-secondary cursor-pointer">
            <Upload size={15} />
            {extractingDoc ? "AI กำลังอ่านเอกสาร..." : "อัปโหลดเอกสาร requirement"}
            <input
              ref={docFileInput}
              type="file"
              accept=".docx,.xlsx,.pdf"
              className="hidden"
              disabled={extractingDoc}
              onChange={(e) => e.target.files?.[0] && handleDocUpload(e.target.files[0])}
            />
          </label>
          {parsedCount > 30 && <span className="badge badge-danger">รองรับสูงสุด 30 ข้อต่อครั้ง</span>}
          <span className="ml-auto hidden text-xs text-slate-400 lg:block">
            รองรับ .docx / .xlsx / .pdf — AI จะแยกเป็นรายข้อให้ ตรวจ/แก้ก่อนกดประเมิน
          </span>
        </div>
      </div>

      {docError && <p className="badge badge-danger mt-3">เกิดข้อผิดพลาด: {docError}</p>}

      {docGuidelines.length > 0 && (
        <div className="mt-3 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-semibold">AI ตั้งข้อสังเกตจากเอกสาร (ควรตรวจก่อนประเมิน)</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            {docGuidelines.map((g, i) => (
              <li key={i}>
                <span className="font-medium">{g.requirement}</span> — {g.guideline}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="badge badge-danger mt-4">เกิดข้อผิดพลาด: {error}</p>}

      {loading && (
        <div className="mt-8 space-y-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--brand)]" />
            กำลังค้นหาเคสอ้างอิงทีละข้อ...
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface-card p-4">
              <div className="skeleton h-3 w-3/4 rounded" />
              <div className="skeleton mt-3 h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          {/* Summary tiles — the numbers the quote is built from, always visible above the table */}
          <div className="fade-up mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="stat-tile">
              <p className="field-label">Requirement ที่พบเคส</p>
              <p className="stat-value">
                {results.filter((r) => r.matches.length > 0).length}
                <span className="text-base font-medium text-slate-400"> / {results.length}</span>
              </p>
            </div>
            <div className="stat-tile">
              <p className="field-label">ข้อที่เลือกรวม</p>
              <p className="stat-value">{totals.counted}</p>
            </div>
            <div className="stat-tile">
              <p className="field-label">รวม MD</p>
              <p className="stat-value">{totals.md}</p>
            </div>
            <div className="stat-tile border-transparent text-white" style={{ background: "var(--brand-gradient)" }}>
              <p className="field-label text-red-100/80">รวม Cost (บาท)</p>
              <p className="stat-value text-white">{totals.cost.toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              ติ๊กเลือกข้อที่ต้องการรวมในใบเสนอราคา · เลือกเคสอ้างอิงอื่นหรือแก้ MD ได้ในแต่ละแถว
            </p>
            <button onClick={() => setShowQuoteModal(true)} disabled={totals.counted === 0} className="btn btn-primary">
              <FileSpreadsheet size={15} />
              สร้างใบเสนอราคา (Excel)
            </button>
          </div>

          <div className="surface-card mt-3 p-3 sm:overflow-x-auto sm:p-0">
            <table className="table-responsive data-table w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="w-12 px-4 py-3 text-center">รวม</th>
                  <th className="px-4 py-3">Requirement</th>
                  <th className="px-4 py-3">เคสอ้างอิง</th>
                  <th className="px-4 py-3">ใกล้เคียง</th>
                  <th className="px-4 py-3">MD</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="w-14 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const row = rows[i];
                  const match = r.matches[row?.selectedIndex ?? 0] ?? null;
                  const lowConfidence = (match?.similarity ?? 0) < LOW_SIMILARITY;
                  const included = row?.included ?? false;
                  return (
                    <tr key={i} className={`align-top ${included ? "" : "opacity-60"}`}>
                      <td data-label="รวม" className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-[var(--brand)]"
                          checked={included}
                          disabled={!match}
                          onChange={(e) => setRow(i, { included: e.target.checked })}
                        />
                      </td>
                      <td data-label="Requirement" className="min-w-[14rem] max-w-xs px-4 py-4">
                        <p className="leading-6 font-medium whitespace-pre-wrap text-slate-800">{r.requirement}</p>
                        {lowConfidence && (
                          <p className="badge badge-warn mt-1.5">ไม่พบเคสที่ใกล้เคียงพอ — ควรประเมินข้อนี้เอง</p>
                        )}
                      </td>
                      <td data-label="เคสอ้างอิง" className="min-w-[15rem] max-w-sm px-4 py-4">
                        {r.matches.length === 0 ? (
                          <span className="text-slate-400">ไม่พบ</span>
                        ) : (
                          <>
                            <select
                              value={row?.selectedIndex ?? 0}
                              onChange={(e) => setRow(i, { selectedIndex: Number(e.target.value), mdOverride: null })}
                              className="control w-full truncate py-1.5 text-xs"
                            >
                              {r.matches.map((m, mi) => (
                                <option key={m.id} value={mi}>
                                  [{(m.similarity * 100).toFixed(0)}%] [{m.module ?? "-"}] {m.detail.slice(0, 60)}
                                </option>
                              ))}
                            </select>
                            {match && (
                              <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">
                                <span className="font-medium text-slate-600">{MODE_LABEL[match.source_type]}</span>
                                {" · "}
                                {match.project ?? "-"}
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td data-label="ใกล้เคียง" className="px-4 py-4 whitespace-nowrap">
                        {match && (
                          <span className={`badge ${similarityBadge(match.similarity)}`}>
                            {(match.similarity * 100).toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td data-label="MD" className="px-4 py-4">
                        {match && (
                          <div className="flex flex-col items-start gap-1.5">
                            <button
                              onClick={() => {
                                setMdDraft(breakdownToDraft(effectiveBreakdown(i, match)));
                                setEditingMdRow(i);
                              }}
                              className="group inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 -ml-1 transition-colors hover:bg-slate-100"
                              title="แก้ไข MD แยกตาม level (ไม่กระทบข้อมูลจริงของเคสอ้างอิง)"
                            >
                              <span
                                className={`text-base font-semibold tabular-nums ${
                                  row?.mdOverride != null ? "text-amber-700" : "text-slate-900"
                                }`}
                              >
                                {computeMdTotal(effectiveBreakdown(i, match)) || "-"}
                                <span className="ml-1 text-xs font-medium text-slate-400">MD</span>
                              </span>
                              <Pencil size={12} className="text-slate-300 group-hover:text-[var(--brand)]" />
                              {row?.mdOverride != null && <span className="badge badge-warn">แก้ไขแล้ว</span>}
                            </button>
                            <MdMatrix breakdown={effectiveBreakdown(i, match)} />
                          </div>
                        )}
                      </td>
                      <td data-label="Cost" className="num px-4 py-4 whitespace-nowrap">
                        {match &&
                          (() => {
                            const cost = computeCostBreakdown(effectiveBreakdown(i, match), rates).total;
                            return (
                              <>
                                <span className="text-base font-semibold text-slate-900">
                                  {cost ? cost.toLocaleString() : "-"}
                                </span>
                                {match.cost == null && (
                                  <p className="mt-1 text-[11px] font-normal text-amber-600">ไม่มีราคา STD ในเคสอ้างอิง</p>
                                )}
                              </>
                            );
                          })()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {match && (
                          <button
                            onClick={() => setDetailItem(match)}
                            title="ดูรายละเอียดเคสอ้างอิง"
                            className="btn-icon"
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
                <tr className="font-medium text-slate-900">
                  <td className="px-4 py-3.5" colSpan={4}>
                    รวม {totals.counted} ข้อที่เลือก
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      MD จากเคสอ้างอิง × อัตราปัจจุบันในหน้าตั้งค่า — ใช้เป็นแนวทางตั้งต้น ไม่ใช่ราคาเสนอจริง
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap tabular-nums">{totals.md} MD</td>
                  <td className="num px-4 py-3.5 whitespace-nowrap text-[var(--brand-dark)]">
                    {totals.cost.toLocaleString()}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {detailItem && <ItemDetailModal item={detailItem} onClose={() => setDetailItem(null)} />}

      {editingMdRow !== null && mdDraft && (
        <Modal
          title="แก้ไข MD แยกตาม level"
          subtitle="แก้เฉพาะใบเสนอราคานี้ — ไม่กระทบข้อมูลจริงของเคสอ้างอิงในระบบ"
          onClose={() => setEditingMdRow(null)}
        >
          <div className="space-y-4 text-sm">
            <div className="surface-card grid grid-cols-2 gap-3 p-4">
              {EDITABLE_ROLES.map((role) => (
                <label key={role} className="flex flex-col gap-1.5">
                  <span className="field-label">{MD_ROLE_LABEL[role]}</span>
                  <input
                    type="number"
                    value={mdDraft[role]}
                    onChange={(e) => setMdDraft((d) => (d ? { ...d, [role]: e.target.value } : d))}
                    className="control w-full tabular-nums"
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
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
                className="btn btn-primary"
              >
                บันทึก
              </button>
              <button
                onClick={() => {
                  setRow(editingMdRow, { mdOverride: null });
                  setEditingMdRow(null);
                }}
                className="btn btn-secondary"
              >
                <RotateCcw size={13} />
                ใช้ค่าจากเคสอ้างอิง
              </button>
              <button onClick={() => setEditingMdRow(null)} className="btn btn-secondary">
                ยกเลิก
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showQuoteModal && (
        <Modal
          title="สร้างใบเสนอราคา"
          subtitle={`รวม ${totals.counted} ข้อที่เลือกไว้ (${totals.md} MD) เป็นใบเสนอราคา Excel ตาม template ของ PINNO`}
          onClose={() => setShowQuoteModal(false)}
        >
          <div className="space-y-4 text-sm">
            <div className="surface-card space-y-4 p-4">
              <label className="flex flex-col gap-1.5">
                <span className="field-label">ชื่อลูกค้า *</span>
                <input
                  value={quoteForm.customerName}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, customerName: e.target.value }))}
                  className="control w-full"
                  placeholder="เช่น ABC Company Limited"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="field-label">ที่อยู่ (ไม่บังคับ)</span>
                <input
                  value={quoteForm.customerAddress}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, customerAddress: e.target.value }))}
                  className="control w-full"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="field-label">ผู้ติดต่อ (ไม่บังคับ)</span>
                <input
                  value={quoteForm.contactPerson}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, contactPerson: e.target.value }))}
                  className="control w-full"
                />
              </label>
            </div>

            {quoteError && <p className="badge badge-danger">{quoteError}</p>}

            <div className="flex gap-2">
              <button onClick={handleExportQuote} disabled={exportingQuote} className="btn btn-primary">
                <FileSpreadsheet size={15} />
                {exportingQuote ? "กำลังสร้าง..." : "ดาวน์โหลด Excel"}
              </button>
              <button onClick={() => setShowQuoteModal(false)} className="btn btn-secondary">
                ยกเลิก
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
