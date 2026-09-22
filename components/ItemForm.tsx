"use client";

import { useEffect, useState } from "react";
import { MD_ROLE_LABEL, SOURCE_TYPE_LABEL } from "@/lib/format";
import { CORE_ROLES, computeCostBreakdown, DEFAULT_RATES, type CoreRole, type MdRates } from "@/lib/mdRates";
import type { SourceType } from "@/lib/types";

export interface ItemFormValues {
  source_type: SourceType;
  module: string;
  detail: string;
  project: string;
  industry: string;
  remark: string;
  cost: string;
  md_breakdown: Record<CoreRole, string>;
}

export const emptyItemFormValues: ItemFormValues = {
  source_type: "new_customer",
  module: "",
  detail: "",
  project: "",
  industry: "",
  remark: "",
  cost: "",
  md_breakdown: {
    fun_junior: "",
    fun_consultant: "",
    fun_senior: "",
    dev_consultant: "",
    dev_senior: "",
    dev_manager: "",
    manager: "",
  },
};

// md_summary matches the convention used throughout the app (see
// lib/parseExcel.ts): sum of every role except Manager.
function computeSummary(breakdown: Record<CoreRole, string>): number {
  return (Object.keys(breakdown) as CoreRole[])
    .filter((role) => role !== "manager")
    .reduce((sum, role) => sum + (Number(breakdown[role]) || 0), 0);
}

interface ItemFormProps {
  initialValues?: ItemFormValues;
  onSave: (values: ItemFormValues) => Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
}

export default function ItemForm({
  initialValues = emptyItemFormValues,
  onSave,
  onCancel,
  saveLabel = "บันทึก",
}: ItemFormProps) {
  const [values, setValues] = useState<ItemFormValues>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rates, setRates] = useState<MdRates>(DEFAULT_RATES);

  useEffect(() => {
    fetch("/api/settings/rates")
      .then((r) => r.json())
      .then((json) => json.rates && setRates(json.rates));
  }, []);

  const { total: suggestedCost } = computeCostBreakdown(values.md_breakdown, rates);

  function setField<K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function setMdField(role: CoreRole, value: string) {
    setValues((v) => ({ ...v, md_breakdown: { ...v.md_breakdown, [role]: value } }));
  }

  async function handleSave() {
    if (!values.detail.trim()) {
      setError("กรุณากรอก Detail");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200";
  const labelClass = "text-xs font-medium text-zinc-500";

  return (
    <div className="space-y-4 text-sm">
      <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 p-1">
        {(["new_customer", "existing_customer"] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setField("source_type", st)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              values.source_type === st ? "bg-[var(--brand)] text-white" : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {SOURCE_TYPE_LABEL[st]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Module</span>
          <input
            value={values.module}
            onChange={(e) => setField("module", e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Cost</span>
          <input
            type="number"
            value={values.cost}
            onChange={(e) => setField("cost", e.target.value)}
            className={inputClass}
          />
          {suggestedCost > 0 && (
            <span className="text-xs text-zinc-400">
              คำนวณจาก MD ปัจจุบัน: {suggestedCost.toLocaleString()}{" "}
              <button
                type="button"
                onClick={() => setField("cost", String(suggestedCost))}
                className="font-medium text-zinc-600 underline"
              >
                ใช้ค่านี้
              </button>
            </span>
          )}
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Detail *</span>
        <textarea
          value={values.detail}
          onChange={(e) => setField("detail", e.target.value)}
          rows={3}
          className={`${inputClass} resize-none`}
        />
      </label>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
        <span className={labelClass}>MD breakdown</span>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {CORE_ROLES.map((role) => (
            <label key={role} className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">{MD_ROLE_LABEL[role]}</span>
              <input
                type="number"
                value={values.md_breakdown[role]}
                onChange={(e) => setMdField(role, e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          รวม (ไม่รวม Manager): <span className="font-medium text-zinc-600">{computeSummary(values.md_breakdown)} MD</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Project</span>
          <input
            value={values.project}
            onChange={(e) => setField("project", e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Industry</span>
          <input
            value={values.industry}
            onChange={(e) => setField("industry", e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Remark</span>
        <textarea
          value={values.remark}
          onChange={(e) => setField("remark", e.target.value)}
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 border-t border-zinc-100 pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
        >
          {saving ? "กำลังบันทึก..." : saveLabel}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-200 px-5 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            ยกเลิก
          </button>
        )}
      </div>
    </div>
  );
}

// Converts form string values into the shape POST /api/items expects.
export function toApiPayload(values: ItemFormValues) {
  const toNum = (s: string) => (s.trim() === "" ? null : Number(s));
  const md_breakdown = Object.fromEntries(
    Object.entries(values.md_breakdown).map(([role, v]) => [role, toNum(v)])
  ) as Record<CoreRole, number | null>;
  return {
    source_type: values.source_type,
    module: values.module.trim() || null,
    detail: values.detail.trim(),
    project: values.project.trim() || null,
    industry: values.industry.trim() || null,
    remark: values.remark.trim() || null,
    cost: toNum(values.cost),
    md_breakdown,
    md_summary: computeSummary(values.md_breakdown),
  };
}
