"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { formatMdBreakdown, MD_ROLE_LABEL } from "@/lib/format";
import { computeCostBreakdown, DEFAULT_RATES, type MdRates } from "@/lib/mdRates";
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
}

interface ChangeLogEntry {
  id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

const MODE_LABEL: Record<string, string> = {
  new_customer: "ลูกค้าใหม่ (Presale)",
  existing_customer: "ลูกค้าเดิม (PM)",
};

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
  const [rates, setRates] = useState<MdRates>(DEFAULT_RATES);

  useEffect(() => {
    fetch(`/api/items/${item.id}/counterpart`)
      .then((r) => r.json())
      .then((json) => setCounterpart(json.counterpart ?? null));
    fetch(`/api/items/${item.id}/history`)
      .then((r) => r.json())
      .then((json) => setHistory(json.logs ?? []));
    fetch("/api/settings/rates")
      .then((r) => r.json())
      .then((json) => json.rates && setRates(json.rates));
  }, [item.id]);

  const { lines: costLines, total: computedCost } = computeCostBreakdown(item.md_breakdown, rates);

  const otherMode = item.source_type === "new_customer" ? "existing_customer" : "new_customer";

  return (
    <Modal title={`[${item.module ?? "-"}] รายละเอียด CR/Customize No.${item.item_no ?? "-"}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div>
          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
            {MODE_LABEL[item.source_type]}
          </span>
          <p className="mt-2 whitespace-pre-wrap text-zinc-800">{item.detail}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 sm:grid-cols-2">
          <div>
            <span className="font-medium text-zinc-500">MD:</span> {formatMdBreakdown(item.md_breakdown)}
            {item.md_summary != null && <span className="text-zinc-400"> (รวม {item.md_summary} MD)</span>}
          </div>
          <div>
            <span className="font-medium text-zinc-500">Cost ที่บันทึกไว้:</span>{" "}
            {item.cost != null ? item.cost.toLocaleString() : "-"}
          </div>
          <div>
            <span className="font-medium text-zinc-500">Project:</span> {item.project ?? "-"}
          </div>
          <div>
            <span className="font-medium text-zinc-500">Industry:</span> {item.industry ?? "-"}
          </div>
        </div>

        {costLines.length > 0 && (
          <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
            <p className="font-medium text-zinc-500">คำนวณจากอัตรา MD ปัจจุบัน (ดู/ปรับที่หน้าตั้งค่า):</p>
            <ul className="mt-1 space-y-0.5">
              {costLines.map((l) => (
                <li key={l.role}>
                  {MD_ROLE_LABEL[l.role]}: {l.md} MD × {l.rate.toLocaleString()} = {l.amount.toLocaleString()}
                </li>
              ))}
            </ul>
            <p className="mt-1 font-medium text-zinc-700">รวม: {computedCost.toLocaleString()} บาท</p>
          </div>
        )}

        {item.remark && (
          <p className="rounded bg-zinc-50 p-2 text-xs whitespace-pre-wrap text-zinc-600">{item.remark}</p>
        )}

        <p className="text-xs text-zinc-500">
          <span className="font-medium">ไฟล์อ้างอิง:</span>{" "}
          {item.source_filename ? (
            <a
              href={`/api/import-batches/${item.import_batch_id}/download`}
              className="text-zinc-700 underline"
            >
              {item.source_filename}
            </a>
          ) : (
            "ไม่มีไฟล์อ้างอิง (เพิ่มด้วยมือ/AI หรือ import ก่อนมีฟีเจอร์นี้)"
          )}
        </p>

        <div className="rounded-lg border border-zinc-200 p-3">
          <h3 className="text-xs font-semibold text-zinc-500">
            เทียบกับ {MODE_LABEL[otherMode]}
          </h3>
          {counterpart === undefined && <p className="mt-1 text-xs text-zinc-400">กำลังโหลด...</p>}
          {counterpart === null && (
            <p className="mt-1 text-xs text-zinc-400">ไม่มีข้อมูลฝั่ง {MODE_LABEL[otherMode]} สำหรับ No.{item.item_no}</p>
          )}
          {counterpart && (
            <div className="mt-1 space-y-1 text-xs text-zinc-600">
              <p className="whitespace-pre-wrap">{counterpart.detail}</p>
              <p>
                <span className="font-medium text-zinc-500">MD:</span>{" "}
                {formatMdBreakdown(counterpart.md_breakdown)}
                {counterpart.md_summary != null && ` (รวม ${counterpart.md_summary} MD)`} ·{" "}
                <span className="font-medium text-zinc-500">Cost:</span>{" "}
                {counterpart.cost != null ? counterpart.cost.toLocaleString() : "-"}
              </p>
              {counterpart.detail !== item.detail && (
                <p className="text-amber-600">ข้อความ requirement ไม่ตรงกันระหว่างสองฝั่ง</p>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold text-zinc-500">ประวัติการแก้ไข</h3>
          {history.length === 0 && <p className="mt-1 text-xs text-zinc-400">ยังไม่มีประวัติการแก้ไข</p>}
          <ul className="mt-1 space-y-1">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-zinc-600">
                <span className="text-zinc-400">{formatDateTime(h.created_at)}</span> ·{" "}
                {ACTION_LABEL[h.action] ?? h.action}
                {h.created_by && <span className="text-zinc-400"> โดย {h.created_by}</span>}
              </li>
            ))}
          </ul>
        </div>

        {canDelete && onDelete && (
          <div className="border-t border-zinc-200 pt-3">
            {!confirmingDelete ? (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="text-sm text-red-600 hover:underline"
              >
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
