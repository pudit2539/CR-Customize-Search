"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import ItemForm, { emptyItemFormValues, toApiPayload, type ItemFormValues } from "./ItemForm";
import type { CrItemMatch } from "@/lib/types";

interface ItemFormModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function ItemFormModal({ onClose, onSaved }: ItemFormModalProps) {
  // When check-duplicate finds near-identical existing items, saving pauses
  // here until the user explicitly confirms (or cancels).
  const [pending, setPending] = useState<{
    values: ItemFormValues;
    duplicates: CrItemMatch[];
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function save(values: ItemFormValues) {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toApiPayload(values)),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
    onSaved();
  }

  async function handleSave(values: ItemFormValues) {
    // Best-effort duplicate check — if the check itself fails, saving should
    // still work rather than blocking the user.
    try {
      const res = await fetch("/api/items/check-duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detail: values.detail }),
      });
      if (res.ok) {
        const json = await res.json();
        const duplicates = (json.duplicates ?? []) as CrItemMatch[];
        if (duplicates.length > 0) {
          setPending({ values, duplicates });
          return;
        }
      }
    } catch {
      // ignore and proceed to save
    }
    await save(values);
  }

  async function confirmSave() {
    if (!pending) return;
    setConfirming(true);
    try {
      await save(pending.values);
    } finally {
      setConfirming(false);
      setPending(null);
    }
  }

  return (
    <Modal title="เพิ่มรายการใหม่" onClose={onClose}>
      <ItemForm initialValues={emptyItemFormValues} onSave={handleSave} onCancel={onClose} />

      {pending && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-amber-800">
            <AlertTriangle size={16} />
            พบรายการที่ใกล้เคียงมากในระบบแล้ว ({pending.duplicates.length} รายการ)
          </p>
          <ul className="mt-2 space-y-2">
            {pending.duplicates.map((d) => (
              <li key={d.id} className="rounded-lg bg-white p-2 text-xs text-zinc-700">
                <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                  {(d.similarity * 100).toFixed(0)}%
                </span>
                [{d.module ?? "-"}] {d.detail.slice(0, 120)}
                {d.project && <span className="ml-1 text-zinc-400">· {d.project}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              onClick={confirmSave}
              disabled={confirming}
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-40"
            >
              {confirming ? "กำลังบันทึก..." : "ยืนยันบันทึกซ้ำ"}
            </button>
            <button
              onClick={() => setPending(null)}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              กลับไปแก้ไข
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
