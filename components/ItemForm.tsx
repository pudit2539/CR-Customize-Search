"use client";

import { useEffect, useState } from "react";
import { MD_ROLE_LABEL } from "@/lib/format";
import { computeCostBreakdown, DEFAULT_RATES, type MdRates } from "@/lib/mdRates";
import type { MdBreakdown, SourceType } from "@/lib/types";

export interface ItemFormValues {
  source_type: SourceType;
  module: string;
  detail: string;
  project: string;
  industry: string;
  remark: string;
  cost: string;
  md_breakdown: Record<keyof MdBreakdown, string>;
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
    dev_senior_mgr: "",
    manager: "",
  },
};

// md_summary matches the convention used throughout the app (see
// lib/parseExcel.ts): sum of every role except Manager.
function computeSummary(breakdown: Record<keyof MdBreakdown, string>): number {
  return (Object.keys(breakdown) as (keyof MdBreakdown)[])
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

  function setMdField(role: keyof MdBreakdown, value: string) {
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

  return (
    <div className="space-y-3 text-sm">
      <div className="flex gap-4">
        {(["new_customer", "existing_customer"] as const).map((st) => (
          <label key={st} className="flex items-center gap-1.5 text-zinc-700">
            <input
              type="radio"
              checked={values.source_type === st}
              onChange={() => setField("source_type", st)}
            />
            {st === "new_customer" ? "ลูกค้าใหม่ (Presale)" : "ลูกค้าเดิม (PM)"}
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Module</span>
          <input
            value={values.module}
            onChange={(e) => setField("module", e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Cost</span>
          <input
            type="number"
            value={values.cost}
            onChange={(e) => setField("cost", e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1"
          />
          {suggestedCost > 0 && (
            <span className="text-xs text-zinc-400">
              คำนวณจาก MD ปัจจุบัน: {suggestedCost.toLocaleString()}{" "}
              <button
                type="button"
                onClick={() => setField("cost", String(suggestedCost))}
                className="text-zinc-600 underline"
              >
                ใช้ค่านี้
              </button>
            </span>
          )}
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Detail *</span>
        <textarea
          value={values.detail}
          onChange={(e) => setField("detail", e.target.value)}
          rows={3}
          className="rounded border border-zinc-300 px-2 py-1"
        />
      </label>

      <div>
        <span className="text-xs text-zinc-500">MD breakdown</span>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {(Object.keys(MD_ROLE_LABEL) as (keyof MdBreakdown)[]).map((role) => (
            <label key={role} className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">{MD_ROLE_LABEL[role]}</span>
              <input
                type="number"
                value={values.md_breakdown[role]}
                onChange={(e) => setMdField(role, e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1"
              />
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-400">รวม (ไม่รวม Manager): {computeSummary(values.md_breakdown)} MD</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Project</span>
          <input
            value={values.project}
            onChange={(e) => setField("project", e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Industry</span>
          <input
            value={values.industry}
            onChange={(e) => setField("industry", e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Remark</span>
        <textarea
          value={values.remark}
          onChange={(e) => setField("remark", e.target.value)}
          rows={2}
          className="rounded border border-zinc-300 px-2 py-1"
        />
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {saving ? "กำลังบันทึก..." : saveLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="text-sm text-zinc-500 hover:underline">
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
  ) as Record<keyof MdBreakdown, number | null>;
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
