"use client";

import { useEffect, useState } from "react";
import { useToast } from "./ToastProvider";
import { Calculator, GitCompare, History as HistoryIcon, Paperclip, Star, Trash2 } from "lucide-react";
import MdMatrix from "./MdMatrix";
import Modal from "./Modal";
import { MD_ROLE_LABEL, SOURCE_TYPE_LABEL } from "@/lib/format";
import { computeCostBreakdown, DEFAULT_RATES, ratesMapFromEntries } from "@/lib/mdRates";
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
  const [counterpart, setCounterpart] = useState<Counterpart | null | undefined>(undefined);
  const [history, setHistory] = useState<ChangeLogEntry[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>(DEFAULT_RATES);
  const [relatedFiles, setRelatedFiles] = useState<{ id: string; filename: string }[]>([]);
  const [nominated, setNominated] = useState<boolean | undefined>(undefined);
  const [nominating, setNominating] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState("");
  const showToast = useToast();

  useEffect(() => {
    fetch(`/api/items/${item.id}/counterpart`)
      .then((r) => r.json())
      .then((json) => setCounterpart(json.counterpart ?? null));
    fetch(`/api/items/${item.id}/history`)
      .then((r) => r.json())
      .then((json) => setHistory(json.logs ?? []));
    fetch("/api/settings/rates")
      .then((r) => r.json())
      .then((json) => json.entries?.length && setRates(ratesMapFromEntries(json.entries)));
    fetch(`/api/items/${item.id}/related-files`)
      .then((r) => r.json())
      .then((json) => setRelatedFiles(json.files ?? []));
    fetch("/api/std-candidates")
      .then((r) => r.json())
      .then((json) => {
        const list = (json.candidates ?? []) as { item?: { id: string } | null }[];
        setNominated(list.some((c) => c.item?.id === item.id));
      });
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
      showToast("เอาออกจาก STD candidate แล้ว");
    } finally {
      setNominating(false);
    }
  }

  const { lines: costLines, total: computedCost } = computeCostBreakdown(item.md_breakdown, rates);

  const otherMode = item.source_type === "new_customer" ? "existing_customer" : "new_customer";

  return (
    <Modal title={`[${item.module ?? "-"}] รายละเอียด CR/Customize No.${item.item_no ?? "-"}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4">
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
            {MODE_LABEL[item.source_type]}
          </span>
          <p className="mt-2 whitespace-pre-wrap text-zinc-800">{item.detail}</p>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-zinc-200 pt-3 text-xs text-zinc-600 sm:grid-cols-2">
            <div>
              <p className="font-medium text-zinc-500">MD</p>
              <div className="mt-1">
                <MdMatrix breakdown={item.md_breakdown} />
                {item.md_summary != null && (
                  <p className="mt-1 text-zinc-400">รวม {item.md_summary} MD</p>
                )}
              </div>
            </div>
            <div>
              <p className="font-medium text-zinc-500">Cost ที่บันทึกไว้</p>
              <p className="mt-1 text-zinc-700">{item.cost != null ? item.cost.toLocaleString() : "-"}</p>
            </div>
            <div>
              <p className="font-medium text-zinc-500">Project</p>
              <p className="mt-1 text-zinc-700">{item.project ?? "-"}</p>
            </div>
            <div>
              <p className="font-medium text-zinc-500">Industry</p>
              <p className="mt-1 text-zinc-700">{item.industry ?? "-"}</p>
            </div>
          </div>
        </div>

        {costLines.length > 0 && (
          <div className="rounded-xl border border-zinc-100 bg-white p-4 text-xs text-zinc-600 shadow-sm shadow-zinc-200/60">
            <p className="flex items-center gap-1.5 font-medium text-zinc-600">
              <Calculator size={13} className="text-zinc-400" />
              คำนวณจากอัตรา MD ปัจจุบัน (ดู/ปรับที่หน้าตั้งค่า)
            </p>
            <ul className="mt-2 space-y-1">
              {costLines.map((l) => (
                <li key={l.role} className="flex justify-between">
                  <span>{MD_ROLE_LABEL[l.role]}</span>
                  <span className="text-zinc-500">
                    {l.md} MD × {l.rate.toLocaleString()} = <span className="font-medium text-zinc-700">{l.amount.toLocaleString()}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-zinc-100 pt-2 text-right font-semibold text-zinc-800">
              รวม {computedCost.toLocaleString()} บาท
            </p>
          </div>
        )}

        {item.remark && (
          <p className="rounded-xl bg-zinc-50 p-3 text-xs whitespace-pre-wrap text-zinc-600">{item.remark}</p>
        )}

        <p className="flex items-start gap-1.5 text-xs text-zinc-500">
          <Paperclip size={13} className="mt-0.5 shrink-0 text-zinc-400" />
          {item.source_filename ? (
            <span>
              <a
                href={`/api/import-batches/${item.import_batch_id}/download`}
                className="text-zinc-700 underline"
              >
                {item.source_filename}
              </a>
              {sourceFileDateLabel(item.source_filename) && (
                <span className="text-zinc-400">
                  {" "}
                  · ประเมินช่วง {sourceFileDateLabel(item.source_filename)}
                </span>
              )}
            </span>
          ) : (
            <span>ไม่มีไฟล์อ้างอิง (เพิ่มด้วยมือ/AI หรือ import ก่อนมีฟีเจอร์นี้)</span>
          )}
        </p>

        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 p-3">
          {nominated === undefined ? (
            <p className="text-xs text-zinc-400">กำลังเช็คสถานะ STD candidate...</p>
          ) : nominated ? (
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <Star size={14} className="fill-amber-500 text-amber-500" />
                อยู่ในรายการเสนอ STD candidate แล้ว
              </span>
              <button
                onClick={unnominate}
                disabled={nominating}
                className="text-xs text-zinc-500 hover:underline disabled:opacity-40"
              >
                เอาออกจากรายการ
              </button>
            </div>
          ) : showNoteInput ? (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เหตุผลที่คิดว่าน่าจะเป็น STD (ไม่บังคับ) เช่น มีลูกค้าหลายเจ้าถามเรื่องนี้..."
                rows={2}
                className="w-full rounded border border-amber-200 bg-white p-2 text-xs"
              />
              <div className="flex gap-2">
                <button
                  onClick={nominate}
                  disabled={nominating}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-40"
                >
                  {nominating ? "กำลังเพิ่ม..." : "ยืนยันเสนอ"}
                </button>
                <button
                  onClick={() => setShowNoteInput(false)}
                  className="text-xs text-zinc-500 hover:underline"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNoteInput(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:underline"
            >
              <Star size={14} />
              เสนอเป็น STD candidate (เพื่อคุยกับพี่ยอด/พี่แชมป์)
            </button>
          )}
        </div>

        {relatedFiles.length > 0 && (
          <div className="rounded-xl border border-zinc-100 bg-white p-3 text-xs text-zinc-500 shadow-sm shadow-zinc-200/60">
            <p className="flex items-center gap-1.5 font-medium text-zinc-600">
              <Paperclip size={13} className="text-zinc-400" />
              ไฟล์ที่เกี่ยวข้องกับโปรเจกต์นี้
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {relatedFiles.map((f) => (
                <li key={f.id}>
                  <a
                    href={`/api/import-batches/${f.id}/download`}
                    className="text-zinc-700 underline"
                  >
                    {f.filename}
                  </a>
                  {sourceFileDateLabel(f.filename) && (
                    <span className="text-zinc-400"> · {sourceFileDateLabel(f.filename)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm shadow-zinc-200/60">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
            <GitCompare size={13} className="text-zinc-400" />
            เทียบกับ {MODE_LABEL[otherMode]}
          </h3>
          {counterpart === undefined && <p className="mt-1.5 text-xs text-zinc-400">กำลังโหลด...</p>}
          {counterpart === null && (
            <p className="mt-1.5 text-xs text-zinc-400">ไม่มีข้อมูลฝั่ง {MODE_LABEL[otherMode]} สำหรับ No.{item.item_no}</p>
          )}
          {counterpart && (
            <div className="mt-2 space-y-2 text-xs text-zinc-600">
              <p className="whitespace-pre-wrap">{counterpart.detail}</p>
              <div className="flex flex-wrap items-start gap-4">
                <div>
                  <p className="font-medium text-zinc-500">MD</p>
                  <div className="mt-1">
                    <MdMatrix breakdown={counterpart.md_breakdown} />
                    {counterpart.md_summary != null && (
                      <p className="mt-1 text-zinc-400">รวม {counterpart.md_summary} MD</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="font-medium text-zinc-500">Cost</p>
                  <p className="mt-1 text-zinc-700">
                    {counterpart.cost != null ? counterpart.cost.toLocaleString() : "-"}
                  </p>
                </div>
              </div>
              {counterpart.detail !== item.detail && (
                <p className="text-amber-600">ข้อความ requirement ไม่ตรงกันระหว่างสองฝั่ง</p>
              )}
              <p className="flex items-start gap-1.5">
                <Paperclip size={12} className="mt-0.5 shrink-0 text-zinc-400" />
                {counterpart.source_filename ? (
                  <span>
                    <a
                      href={`/api/import-batches/${counterpart.import_batch_id}/download`}
                      className="text-zinc-700 underline"
                    >
                      {counterpart.source_filename}
                    </a>
                    {sourceFileDateLabel(counterpart.source_filename) && (
                      <span className="text-zinc-400">
                        {" "}
                        · ประเมินช่วง {sourceFileDateLabel(counterpart.source_filename)}
                      </span>
                    )}
                  </span>
                ) : (
                  <span>ไม่มีไฟล์อ้างอิง</span>
                )}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm shadow-zinc-200/60">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
            <HistoryIcon size={13} className="text-zinc-400" />
            ประวัติการแก้ไข
          </h3>
          {history.length === 0 && <p className="mt-1.5 text-xs text-zinc-400">ยังไม่มีประวัติการแก้ไข</p>}
          <ul className="mt-1.5 space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="flex items-baseline gap-2 text-xs text-zinc-600">
                <span className="h-1 w-1 shrink-0 rounded-full bg-zinc-300" />
                <span className="text-zinc-400">{formatDateTime(h.created_at)}</span>
                {ACTION_LABEL[h.action] ?? h.action}
                {h.created_by && <span className="text-zinc-400">โดย {h.created_by}</span>}
              </li>
            ))}
          </ul>
        </div>

        {canDelete && onDelete && (
          <div className="border-t border-zinc-100 pt-3">
            {!confirmingDelete ? (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1.5 text-sm text-red-600 hover:underline"
              >
                <Trash2 size={14} />
                ลบรายการนี้
              </button>
            ) : (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-zinc-700">ยืนยันการลบรายการนี้?</span>
                <button onClick={onDelete} className="font-medium text-red-600 hover:underline">
                  ยืนยัน
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="text-zinc-500 hover:underline"
                >
                  ยกเลิก
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
