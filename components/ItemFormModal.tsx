"use client";

import Modal from "./Modal";
import ItemForm, { emptyItemFormValues, toApiPayload, type ItemFormValues } from "./ItemForm";

interface ItemFormModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function ItemFormModal({ onClose, onSaved }: ItemFormModalProps) {
  async function handleSave(values: ItemFormValues) {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toApiPayload(values)),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
    onSaved();
  }

  return (
    <Modal title="เพิ่มรายการใหม่" onClose={onClose}>
      <ItemForm initialValues={emptyItemFormValues} onSave={handleSave} onCancel={onClose} />
    </Modal>
  );
}
