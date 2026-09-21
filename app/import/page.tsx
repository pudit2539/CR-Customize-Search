"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import ItemForm, { toApiPayload, type ItemFormValues } from "@/components/ItemForm";
import type { ExtractedItemDraft } from "@/lib/claude";
import { SOURCE_TYPE_LABEL } from "@/lib/format";

interface ImportSummary {
  total: number;
  inserted: number;
  updated: number;
  by_source: { new_customer: number; existing_customer: number };
}

function ExcelUploadTab() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function pickFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("รองรับเฉพาะไฟล์ .xlsx");
      return;
    }
    setError(null);
    setSummary(null);
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError("กรุณาเลือกหรือลากไฟล์ .xlsx ก่อน");
      return;
    }
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "import failed");
      setSummary(json);
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="text-zinc-600">
        อัพโหลดไฟล์ &quot;Presale - PINNO_Customize Mandays item list.xlsx&quot; (หรือเวอร์ชันล่าสุดที่ดาวน์โหลดจาก
        SharePoint) — ระบบจะอ่าน sheet &quot;Estimate MD (New)&quot; และ &quot;Estimate MD&quot;
        อัพโหลดไฟล์เดิมซ้ำได้ตลอด รายการที่มีอยู่แล้วจะถูกอัพเดท ไม่สร้างซ้ำ
      </p>

      <a
        href="/api/import/template"
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        <Download size={15} />
        ดาวน์โหลด Template ว่าง (กรอกง่าย, ใช้ format เดียวกับ import ได้เลย)
      </a>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          pickFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => fileInput.current?.click()}
        className={`mt-6 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragActive ? "border-zinc-500 bg-zinc-100" : "border-zinc-300 bg-white hover:bg-zinc-50"
        }`}
      >
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        {selectedFile ? (
          <p className="text-sm text-zinc-700">
            เลือกไฟล์แล้ว: <span className="font-medium">{selectedFile.name}</span>
          </p>
        ) : (
          <p className="text-sm text-zinc-500">ลากไฟล์ .xlsx มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={loading || !selectedFile}
        className="mt-4 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {loading ? "กำลังนำเข้า... (อาจใช้เวลาสักครู่)" : "นำเข้า"}
      </button>

      {error && <p className="mt-4 text-sm text-red-600">เกิดข้อผิดพลาด: {error}</p>}

      {summary && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p>นำเข้าสำเร็จ ทั้งหมด {summary.total} รายการ</p>
          <p>
            เพิ่มใหม่ {summary.inserted} รายการ, อัพเดท {summary.updated} รายการ
          </p>
          <p className="mt-1 text-zinc-600">
            {SOURCE_TYPE_LABEL.new_customer}: {summary.by_source.new_customer} ·{" "}
            {SOURCE_TYPE_LABEL.existing_customer}: {summary.by_source.existing_customer}
          </p>
        </div>
      )}
    </div>
  );
}

function draftToFormValues(draft: ExtractedItemDraft): ItemFormValues {
  const numToStr = (n: number | null | undefined) => (n == null ? "" : String(n));
  return {
    source_type: draft.source_type_guess,
    module: draft.module ?? "",
    detail: draft.detail,
    project: draft.project ?? "",
    industry: draft.industry ?? "",
    remark: draft.remark ?? "",
    cost: numToStr(draft.cost),
    md_breakdown: {
      fun_junior: numToStr(draft.md_breakdown.fun_junior),
      fun_consultant: numToStr(draft.md_breakdown.fun_consultant),
      fun_senior: numToStr(draft.md_breakdown.fun_senior),
      dev_consultant: numToStr(draft.md_breakdown.dev_consultant),
      dev_senior: numToStr(draft.md_breakdown.dev_senior),
      dev_manager: numToStr(draft.md_breakdown.dev_manager),
      manager: numToStr(draft.md_breakdown.manager),
    },
  };
}

function PasteExtractTab() {
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ItemFormValues[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  async function runExtract(body: FormData | { text: string }) {
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/items/extract",
        body instanceof FormData
          ? { method: "POST", body }
          : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "แยกข้อมูลไม่สำเร็จ");
      const extracted: ExtractedItemDraft[] = json.drafts ?? [];
      if (extracted.length === 0) {
        setError("AI ไม่พบ requirement ที่แยกออกมาได้");
        return;
      }
      setDrafts(extracted.map(draftToFormValues));
      setSavedCount(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtracting(false);
    }
  }

  function handleExtract() {
    if (!text.trim()) return;
    runExtract({ text });
  }

  function handleFileExtract(file: File) {
    const form = new FormData();
    form.append("file", file);
    runExtract(form).finally(() => {
      if (fileInput.current) fileInput.current.value = "";
    });
  }

  async function saveDraft(index: number, values: ItemFormValues) {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toApiPayload(values)),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
    setDrafts((prev) => prev.filter((_, i) => i !== index));
    setSavedCount((c) => c + 1);
  }

  return (
    <div>
      <p className="text-zinc-600">
        วางข้อความ requirement ที่ได้รับมา หรืออัปโหลดไฟล์ Word/Excel ที่ไม่มี format ตายตัว
        (เช่น team Implement/PM กรอกผ่าน Word เอง) — AI จะช่วยแยกเป็นรายการให้ตรวจสอบ/แก้ไขก่อนบันทึก
        ตัวเลข MD/Cost จะใส่ให้เฉพาะที่ระบุไว้ในเอกสารจริงๆเท่านั้น จะไม่เดาให้
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="เช่น: ลูกค้า ABC อยากให้เพิ่มเงื่อนไขการคำนวณ OT แยกตามกะ... (Module: TM, ประมาณ 3 MD)"
        className="mt-4 w-full resize-none rounded-lg border border-zinc-300 bg-white p-3 text-sm"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={handleExtract}
          disabled={extracting || !text.trim()}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {extracting ? "กำลังวิเคราะห์..." : "วิเคราะห์ข้อความด้วย AI"}
        </button>
        <span className="text-xs text-zinc-400">หรือ</span>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          <Upload size={15} />
          {extracting ? "กำลังวิเคราะห์..." : "อัปโหลดไฟล์ Word/Excel ที่ไม่มี format"}
          <input
            ref={fileInput}
            type="file"
            accept=".docx,.xlsx,.pdf"
            className="hidden"
            disabled={extracting}
            onChange={(e) => e.target.files?.[0] && handleFileExtract(e.target.files[0])}
          />
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {savedCount > 0 && (
        <p className="mt-4 text-sm text-emerald-600">บันทึกแล้ว {savedCount} รายการ</p>
      )}

      {drafts.length > 0 && (
        <div className="mt-6 space-y-4">
          <p className="text-sm font-medium text-zinc-700">
            AI แยกได้ {drafts.length} รายการ — ตรวจสอบและแก้ไขก่อนบันทึกแต่ละรายการ
          </p>
          {drafts.map((draft, i) => (
            <div key={i} className="rounded-lg border border-zinc-200 bg-white p-4">
              <ItemForm
                initialValues={draft}
                onSave={(values) => saveDraft(i, values)}
                onCancel={() => setDrafts((prev) => prev.filter((_, idx) => idx !== i))}
                saveLabel="บันทึกรายการนี้"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ImportPage() {
  const [tab, setTab] = useState<"excel" | "paste">("excel");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-xl font-semibold sm:text-2xl">นำเข้าข้อมูล</h1>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setTab("excel")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "excel"
              ? "bg-indigo-600 text-white"
              : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
          }`}
        >
          อัพโหลด Excel
        </button>
        <button
          onClick={() => setTab("paste")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "paste"
              ? "bg-indigo-600 text-white"
              : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
          }`}
        >
          วางข้อความ (AI ช่วยแยก)
        </button>
      </div>

      <div className="mt-6">{tab === "excel" ? <ExcelUploadTab /> : <PasteExtractTab />}</div>
    </div>
  );
}
