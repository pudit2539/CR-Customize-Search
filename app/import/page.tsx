"use client";

import { useRef, useState } from "react";

interface ImportSummary {
  total: number;
  inserted: number;
  updated: number;
  by_source: { new_customer: number; existing_customer: number };
}

export default function ImportPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function handleUpload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "import failed");
      setSummary(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">นำเข้าไฟล์ Excel</h1>
      <p className="mt-1 text-zinc-600">
        อัพโหลดไฟล์ &quot;Presale - PINNO_Customize Mandays item list.xlsx&quot; (หรือเวอร์ชันล่าสุดที่ดาวน์โหลดจาก
        SharePoint) — ระบบจะอ่าน sheet &quot;Estimate MD (New)&quot; และ &quot;Estimate MD&quot;
        อัพโหลดไฟล์เดิมซ้ำได้ตลอด รายการที่มีอยู่แล้วจะถูกอัพเดท ไม่สร้างซ้ำ
      </p>

      <div className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-white p-6">
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx"
          className="block w-full text-sm text-zinc-600"
        />
        <button
          onClick={handleUpload}
          disabled={loading}
          className="mt-4 rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {loading ? "กำลังนำเข้า... (อาจใช้เวลาสักครู่)" : "นำเข้า"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">เกิดข้อผิดพลาด: {error}</p>}

      {summary && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p>นำเข้าสำเร็จ ทั้งหมด {summary.total} รายการ</p>
          <p>เพิ่มใหม่ {summary.inserted} รายการ, อัพเดท {summary.updated} รายการ</p>
          <p className="mt-1 text-zinc-600">
            ลูกค้าใหม่: {summary.by_source.new_customer} · ลูกค้าเดิม: {summary.by_source.existing_customer}
          </p>
        </div>
      )}
    </div>
  );
}
