"use client";

import { useEffect, useState } from "react";
import { MD_ROLE_LABEL } from "@/lib/format";
import { DEFAULT_RATES, type MdRates } from "@/lib/mdRates";

export default function SettingsPage() {
  const [rates, setRates] = useState<MdRates>(DEFAULT_RATES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/rates")
      .then((r) => r.json())
      .then((json) => setRates(json.rates ?? DEFAULT_RATES))
      .finally(() => setLoading(false));
  }, []);

  function setRate(role: keyof MdRates, value: string) {
    setRates((r) => ({ ...r, [role]: value === "" ? 0 : Number(value) }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rates),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ");
      setRates(json.rates);
      setMessage("บันทึกแล้ว");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <h1 className="text-2xl font-semibold">ตั้งค่าอัตรา MD</h1>
      <p className="mt-1 text-zinc-600">
        อัตรา (บาท/MD) ต่อระดับ — ใช้คำนวณ cost ที่แนะนำเวลาเพิ่มรายการใหม่ และแสดง breakdown ในหน้ารายละเอียด
        item **ไม่มีผลกับ cost ของรายการเก่าที่บันทึกไว้แล้ว**
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-zinc-500">กำลังโหลด...</p>
      ) : (
        <div className="mt-6 space-y-3">
          {(Object.keys(rates) as (keyof MdRates)[]).map((role) => (
            <label key={role} className="flex items-center justify-between gap-4">
              <span className="text-sm text-zinc-700">{MD_ROLE_LABEL[role]}</span>
              <input
                type="number"
                value={rates[role]}
                onChange={(e) => setRate(role, e.target.value)}
                className="w-32 rounded border border-zinc-300 px-2 py-1 text-right text-sm"
              />
            </label>
          ))}

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          {message && <p className="text-sm text-zinc-600">{message}</p>}
        </div>
      )}
    </div>
  );
}
