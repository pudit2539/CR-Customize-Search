"use client";

import { useEffect, useState } from "react";
import { useToast } from "./ToastProvider";
import { Calculator, FileText, GitCompare, History as HistoryIcon, Paperclip, Star, Trash2 } from "lucide-react";
import MdMatrix from "./MdMatrix";
import Modal from "./Modal";
import { MD_ROLE_LABEL, SOURCE_TYPE_LABEL } from "@/lib/format";
import { computeCostBreakdown, DEFAULT_RATES, ratesMapFromEntries } from "@/lib/mdRates";
import { loadItemDetail, patchItemDetail, peekItemDetail } from "@/lib/itemDetailCache";
import { sourceFileDateLabel } from "@/lib/sourceFileDates";
import type { CrItemRow } from "@/lib/types";

interface Counterpart {
  id: string;
  source_type: string;
  item_no: number | null;
  module: string | null;
  detail: string;
  md_breakdown: CrItemRow["md_breakdown"];
  md_summary: number | null;
  cost: number | null;
  project: string | null;
  industry: string | null;
  remark: string | null;
  import_batch_id: string | null;
  source_filename: string | null;
}

interface ChangeLogEntry {
  id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

const MODE_LABEL = SOURCE_TYPE_LABEL;

const ACTION_LABEL: Record<string, string> = {
  insert: "เพิ่มรายการ (manual)",
  update: "แก้ไข (manual)",
  delete: "ลบ (manual)",
  import_insert: "เพิ่มรายการ (import)",
  import_update: "อัพเดท (import)",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

interface ItemDetailModalProps {
  item: CrItemRow;
  onClose: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
}

export default function ItemDetailModal({ item, onClose, canDelete, onDelete }: ItemDetailModalProps) {
  // Seed from the prefetch cache so a warmed item opens fully populated with
  // no loading flash.
  const cached = peekItemDetail(item.id);
  const [counterpart, setCounterpart] = useState<Counterpart | null | undefined>(cached?.counterpart);
  const [history, setHistory] = useState<ChangeLogEntry[]>((cached?.logs as ChangeLogEntry[]) ?? []);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>(
    cached?.rateEntries.length ? ratesMapFromEntries(cached.rateEntries) : DEFAULT_RATES
  );
  const [relatedFiles, setRelatedFiles] = useState<{ id: string; filename: string }[]>(cached?.files ?? []);
  const [nominated, setNominated] = useState<boolean | undefined>(cached?.nominated);
  const [nominating, setNominating] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState("");
  const showToast = useToast();

  useEffect(() => {
    // One combined request (usually already warmed by prefetchItemDetail on
    // hover) instead of five separate ones.
    let cancelled = false;
    loadItemDetail(item.id)
      .then((d) => {
        if (cancelled) return;
        setCounterpart(d.counterpart);
        setHistory(d.logs as ChangeLogEntry[]);
        setRelatedFiles(d.files);
        setNominated(d.nominated);
        if (d.rateEntries.length) setRates(ratesMapFromEntries(d.rateEntries));
      })
      .catch(() => {
        if (cancelled) return;
        setCounterpart(null);
        setNominated(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  async function nominate() {
    setNominating(true);
    try {
      await fetch("/api/std-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id, note }),
      });
      setNominated(true);
      patchItemDetail(item.id, { nominated: true });
      setShowNoteInput(false);
      showToast("เสนอเป็น STD candidate แล้ว");
    } finally {
      setNominating(false);
    }
  }

  async function unnominate() {
    setNominating(true);
    try {
      await fetch(`/api/std-candidates?item_id=${item.id}`, { method: "DELETE" });
      setNominated(false);
      patchItemDetail(item.id, { nominated: false });
      showToast("เอาออกจาก STD candidate แล้ว");
    } finally {
      setNominating(false);
    }
  }

  const { lines: costLines, total: computedCost } = computeCostBreakdown(item.md_breakdown, rates);

  const otherMode = item.source_type === "new_customer" ? "existing_customer" : "new_customer";

  const fileLabel = (name: string) => sourceFileDateLabel(name);

  return (
    <Modal
      size="lg"
      title={`CR/Customize No.${item.item_no ?? "-"}`}
      subtitle={[item.module, item.project].filter(Boolean).join(" · ") || undefined}
      onClose={onClose}
    >
      <div className="space-y-4 text-sm">
        {/* Requirement + the figures people actually compare on */}
        <section className="surface-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-brand">{MODE_LABEL[item.source_type]}</span>
            {item.module && <span className="badge badge-neutral">{item.module}</span>}
            {item.industry && <span className="badge badge-info">{item.industry}</span>}
          </div>
          <p className="mt-3 leading-6 whitespace-pre-wrap text-slate-800">{item.detail}</p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 px-3.5 py-3">
              <p className="field-label">รวม MD</p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900 tabular-nums">
                {item.md_summary != null ? item.md_summary : "-"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3.5 py-3">
              <p className="field-label">Cost ที่บันทึกไว้</p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900 tabular-nums">
                {item.cost != null ? item.cost.toLocaleString() : "-"}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <p className="field-label mb-1.5">MD แยกตาม Level</p>
            <MdMatrix breakdown={item.md_breakdown} />
          </div>
        </section>

        {costLines.length > 0 && (
          <section className="surface-card p-5">
            <h3 className="section-title">
              <Calculator size={13} />
              คำนวณจากอัตรา MD ปัจจุบัน
              <span className="font-normal tracking-normal text-slate-400 normal-case">(ปรับอัตราได้ที่หน้าตั้งค่า)</span>
            </h3>
            <table className="mt-3 w-full text-sm tabular-nums">
              <tbody>
                {costLines.map((l) => (
                  <tr key={l.role} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 text-slate-700">{MD_ROLE_LABEL[l.role]}</td>
                    <td className="py-2 text-right text-slate-500">
                      {l.md} MD × {l.rate.toLocaleString()}
                    </td>
                    <td className="w-28 py-2 text-right font-medium text-slate-900">{l.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-2.5 text-white">
              <span className="text-xs font-medium tracking-wide text-slate-300 uppercase">รวมโดยประมาณ</span>
              <span className="text-base font-semibold tabular-nums">{computedCost.toLocaleString()} บาท</span>
            </div>
          </section>
        )}

        {item.remark && (
          <section className="surface-card p-5">
            <h3 className="section-title">
              <FileText size={13} />
              หมายเหตุ
            </h3>
            <p className="mt-2 text-xs leading-5 whitespace-pre-wrap text-slate-600">{item.remark}</p>
          </section>
        )}

        <section className="surface-card p-5">
          <h3 className="section-title">
            <Paperclip size={13} />
            ไฟล์อ้างอิง
          </h3>
          <div className="mt-2.5 space-y-1.5 text-xs">
            {item.source_filename ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
                <a
                  href={`/api/import-batches/${item.import_batch_id}/download`}
                  className="min-w-0 truncate font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 hover:decoration-[var(--brand)]"
                >
                  {item.source_filename}
                </a>
                {fileLabel(item.source_filename) && (
                  <span className="shrink-0 text-slate-400">ประเมินช่วง {fileLabel(item.source_filename)}</span>
                )}
              </div>
            ) : (
              <p className="text-slate-400">ไม่มีไฟล์อ้างอิง (เพิ่มด้วยมือ/AI หรือ import ก่อนมีฟีเจอร์นี้)</p>
            )}
            {relatedFiles.length > 0 && (
              <>
                <p className="field-label pt-2">ไฟล์ที่เกี่ยวข้องกับโปรเจกต์นี้</p>
                {relatedFiles.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <a
                      href={`/api/import-batches/${f.id}/download`}
                      className="min-w-0 truncate text-slate-700 underline decoration-slate-300 underline-offset-2 hover:decoration-[var(--brand)]"
                    >
                      {f.filename}
                    </a>
                    {fileLabel(f.filename) && <span className="shrink-0 text-slate-400">{fileLabel(f.filename)}</span>}
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        {/* STD candidate nomination */}
        <section
          className={`rounded-[var(--radius-card)] border p-4 ${
            nominated ? "border-amber-200 bg-amber-50" : "border-dashed border-slate-300 bg-white"
          }`}
        >
          {nominated === undefined ? (
            <p className="text-xs text-slate-400">กำลังเช็คสถานะ STD candidate...</p>
          ) : nominated ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                <Star size={15} className="fill-amber-500 text-amber-500" />
                อยู่ในรายการเสนอ STD candidate แล้ว
              </span>
              <button
                onClick={unnominate}
                disabled={nominating}
                className="text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-40"
              >
                เอาออกจากรายการ
              </button>
            </div>
          ) : showNoteInput ? (
            <div className="space-y-2.5">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เหตุผลที่คิดว่าน่าจะเป็น STD (ไม่บังคับ) เช่น มีลูกค้าหลายเจ้าถามเรื่องนี้..."
                rows={2}
                className="control w-full text-xs"
              />
              <div className="flex gap-2">
                <button onClick={nominate} disabled={nominating} className="btn btn-primary py-1.5 text-xs">
                  {nominating ? "กำลังเพิ่ม..." : "ยืนยันเสนอ"}
                </button>
                <button onClick={() => setShowNoteInput(false)} className="btn btn-secondary py-1.5 text-xs">
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNoteInput(true)}
              className="flex items-center gap-2 text-xs font-semibold text-slate-700 transition-colors hover:text-[var(--brand)]"
            >
              <Star size={15} />
              เสนอเป็น STD candidate
              <span className="font-normal text-slate-400">(เพื่อคุยกับพี่ยอด/พี่แชมป์)</span>
            </button>
          )}
        </section>

        <section className="surface-card p-5">
          <h3 className="section-title">
            <GitCompare size={13} />
            เทียบกับ {MODE_LABEL[otherMode]}
          </h3>
          {counterpart === undefined && <div className="skeleton mt-3 h-16 rounded-lg" />}
          {counterpart === null && (
            <p className="mt-2 text-xs text-slate-400">
              ไม่มีข้อมูลฝั่ง {MODE_LABEL[otherMode]} สำหรับ No.{item.item_no}
            </p>
          )}
          {counterpart && (
            <div className="mt-3 space-y-3 text-xs text-slate-600">
              <p className="leading-5 whitespace-pre-wrap text-slate-700">{counterpart.detail}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                  <p className="field-label">รวม MD</p>
                  <p className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">
                    {counterpart.md_summary ?? "-"}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                  <p className="field-label">Cost</p>
                  <p className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">
                    {counterpart.cost != null ? counterpart.cost.toLocaleString() : "-"}
                  </p>
                </div>
              </div>
              <MdMatrix breakdown={counterpart.md_breakdown} />
              {counterpart.detail !== item.detail && (
                <p className="badge badge-warn">ข้อความ requirement ไม่ตรงกันระหว่างสองฝั่ง</p>
              )}
              <p className="flex items-start gap-1.5 text-slate-500">
                <Paperclip size={12} className="mt-0.5 shrink-0 text-slate-400" />
                {counterpart.source_filename ? (
                  <span>
                    <a
                      href={`/api/import-batches/${counterpart.import_batch_id}/download`}
                      className="text-slate-700 underline decoration-slate-300 underline-offset-2"
                    >
                      {counterpart.source_filename}
                    </a>
                    {fileLabel(counterpart.source_filename) && (
                      <span className="text-slate-400"> · ประเมินช่วง {fileLabel(counterpart.source_filename)}</span>
                    )}
                  </span>
                ) : (
                  <span>ไม่มีไฟล์อ้างอิง</span>
                )}
              </p>
            </div>
          )}
        </section>

        <section className="surface-card p-5">
          <h3 className="section-title">
            <HistoryIcon size={13} />
            ประวัติการแก้ไข
          </h3>
          {history.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">ยังไม่มีประวัติการแก้ไข</p>
          ) : (
            <ul className="timeline mt-3">
              {history.map((h) => (
                <li key={h.id} className="text-xs">
                  <p className="font-medium text-slate-700">{ACTION_LABEL[h.action] ?? h.action}</p>
                  <p className="mt-0.5 text-slate-400">
                    {formatDateTime(h.created_at)}
                    {h.created_by && ` · โดย ${h.created_by}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canDelete && onDelete && (
          <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-red-100 bg-white p-4">
            {!confirmingDelete ? (
              <>
                <span className="text-xs text-slate-500">การลบไม่สามารถย้อนกลับได้</span>
                <button onClick={() => setConfirmingDelete(true)} className="btn btn-danger py-1.5 text-xs">
                  <Trash2 size={13} />
                  ลบรายการนี้
                </button>
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-slate-800">ยืนยันการลบรายการนี้?</span>
                <div className="flex gap-2">
                  <button onClick={onDelete} className="btn bg-red-600 py-1.5 text-xs text-white hover:bg-red-700">
                    ยืนยันลบ
                  </button>
                  <button onClick={() => setConfirmingDelete(false)} className="btn btn-secondary py-1.5 text-xs">
                    ยกเลิก
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
