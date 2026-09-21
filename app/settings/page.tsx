"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, Lock, Plus, Trash2, Upload } from "lucide-react";
import { CORE_ROLES, type RateEntry } from "@/lib/mdRates";

// Groups rate rows by the same Functional/Dev/Manager split used for the MD
// breakdown itself, so the table reads as three short lists instead of one
// long undifferentiated one — a colored dot per group doubles as a quick
// visual anchor when scanning.
const ROLE_CATEGORY_ORDER = ["Functional", "Dev", "Manager", "อื่นๆ"] as const;
const ROLE_CATEGORY_COLOR: Record<string, string> = {
  Functional: "bg-sky-500",
  Dev: "bg-violet-500",
  Manager: "bg-pink-500",
  อื่นๆ: "bg-zinc-400",
};
function categoryOfRole(role: string): string {
  if (role.startsWith("fun_")) return "Functional";
  if (role.startsWith("dev_")) return "Dev";
  if (role.startsWith("manager")) return "Manager";
  return "อื่นๆ";
}

interface RateChange {
  id: string;
  role: string;
  action: string;
  before: { label?: string | null; rate?: number } | null;
  after: { label?: string | null; rate?: number; source_file?: string; rate_year?: number } | null;
  created_by: string | null;
  created_at: string;
}

interface ImportSummary {
  applied: { role: string; label: string; from: number | null; to: number }[];
  unchanged: string[];
  year: number | null;
  filename: string;
}

const ACTION_LABEL: Record<string, string> = {
  insert: "เพิ่ม",
  update: "แก้ไข",
  delete: "ลบ",
  import: "import",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export default function SettingsPage() {
  const [entries, setEntries] = useState<RateEntry[]>([]);
  const [history, setHistory] = useState<RateChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Row edits are buffered locally per role until that row's save is clicked.
  const [drafts, setDrafts] = useState<Record<string, { label: string; rate: string }>>({});
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [confirmDeleteRole, setConfirmDeleteRole] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow] = useState({ role: "", label: "", rate: "" });
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, RateEntry[]>();
    for (const e of entries) {
      const cat = categoryOfRole(e.role);
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(e);
    }
    return ROLE_CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => [c, groups.get(c)!] as [string, RateEntry[]]);
  }, [entries]);

  function applyResponse(json: { entries?: RateEntry[]; history?: RateChange[]; error?: string }) {
    if (json.error) {
      setError(json.error);
      return false;
    }
    setEntries(json.entries ?? []);
    setHistory(json.history ?? []);
    setError(null);
    return true;
  }

  useEffect(() => {
    fetch("/api/settings/rates")
      .then((r) => r.json())
      .then(applyResponse)
      .finally(() => setLoading(false));
  }, []);

  function draftOf(e: RateEntry) {
    return drafts[e.role] ?? { label: e.label ?? e.role, rate: String(e.rate) };
  }

  function isDirty(e: RateEntry) {
    const d = drafts[e.role];
    return d != null && (d.label !== (e.label ?? e.role) || Number(d.rate) !== e.rate);
  }

  async function saveRow(role: string, label: string, rate: string) {
    setSavingRole(role);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, label, rate: Number(rate) }),
      });
      const json = await res.json();
      if (applyResponse(json)) {
        setDrafts((d) => {
          const { [role]: _drop, ...rest } = d;
          return rest;
        });
        setMessage("บันทึกแล้ว");
        setShowAdd(false);
        setNewRow({ role: "", label: "", rate: "" });
      }
    } finally {
      setSavingRole(null);
    }
  }

  async function deleteRow(role: string) {
    setSavingRole(role);
    setMessage(null);
    try {
      const res = await fetch(`/api/settings/rates?role=${encodeURIComponent(role)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (applyResponse(json)) setMessage(`ลบ ${role} แล้ว`);
    } finally {
      setSavingRole(null);
      setConfirmDeleteRole(null);
    }
  }

  async function handleImport(file: File) {
    setImporting(true);
    setMessage(null);
    setImportSummary(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/settings/rates/import", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "import ไม่สำเร็จ");
        return;
      }
      setImportSummary(json);
      const refreshed = await fetch("/api/settings/rates").then((r) => r.json());
      applyResponse(refreshed);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900">ตั้งค่าอัตรา MD (Master Data)</h1>
      <p className="mt-1 text-zinc-600">
        อัตราต้นทุน (บาท/MD) ต่อระดับ — ใช้คำนวณ cost แนะนำและ breakdown ในหน้ารายละเอียด
        ไม่มีผลกับ cost ของรายการเก่าที่บันทึกไว้แล้ว
      </p>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
        <p className="font-medium text-zinc-800">เกณฑ์คร่าวๆ ในการเลือกระดับ (level) ก่อนกรอก MD</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase">Functional (Fun)</p>
            <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
              <li><span className="font-medium text-zinc-700">Junior</span> — งานตั้งค่าตรงไปตรงมา ทำตาม checklist มาตรฐาน ไม่มีเงื่อนไขซับซ้อน</li>
              <li><span className="font-medium text-zinc-700">Consultant</span> — ต้องออกแบบ logic/เงื่อนไขเฉพาะของลูกค้า วิเคราะห์ requirement เอง</li>
              <li><span className="font-medium text-zinc-700">Senior</span> — requirement ซับซ้อนสูง กระทบหลายโมดูล หรือต้องตัดสินใจเชิงสถาปัตยกรรม</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase">Dev</p>
            <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
              <li><span className="font-medium text-zinc-700">Consultant</span> — เขียนโค้ด/พัฒนาโปรแกรมตาม spec ที่ชัดเจนแล้ว</li>
              <li><span className="font-medium text-zinc-700">Senior/Manager</span> — งาน dev ที่ซับซ้อน ต้องออกแบบ solution เอง หรือ integrate ระบบภายนอก</li>
            </ul>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Manager = เวลาที่ PM ใช้บริหารโปรเจกต์/ประชุมลูกค้า ไม่เกี่ยวกับความยากของ requirement
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-4 text-sm text-emerald-600">{message}</p>}

      {loading ? (
        <div className="mt-6 animate-pulse space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-xl border border-zinc-200 bg-white" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-100 bg-white shadow-sm shadow-zinc-200/60">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">ระดับ / Role</th>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium text-right">อัตรา (บาท/MD)</th>
                  <th className="px-4 py-3 font-medium">แก้ไขล่าสุด</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              {groupedEntries.map(([category, rows]) => (
                <tbody key={category}>
                  <tr className="border-t border-zinc-100 bg-zinc-50/80">
                    <td colSpan={5} className="px-4 py-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                        <span className={`h-2 w-2 rounded-full ${ROLE_CATEGORY_COLOR[category]}`} />
                        {category}
                        <span className="font-normal text-zinc-400">({rows.length})</span>
                      </span>
                    </td>
                  </tr>
                  {rows.map((e) => {
                    const core = (CORE_ROLES as string[]).includes(e.role);
                    const d = draftOf(e);
                    return (
                      <tr key={e.role} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                      <td className="px-4 py-2.5">
                        <input
                          value={d.label}
                          onChange={(ev) =>
                            setDrafts((prev) => ({ ...prev, [e.role]: { ...d, label: ev.target.value } }))
                          }
                          className="w-full max-w-xs rounded-lg border border-transparent bg-transparent px-2 py-1 hover:border-zinc-200 focus:border-zinc-300 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600">
                          {e.role}
                        </span>
                        {core && (
                          <span
                            className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
                            title="ใช้คำนวณ cost ของ MD breakdown — ลบไม่ได้"
                          >
                            <Lock size={9} />
                            core
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          value={d.rate}
                          onChange={(ev) =>
                            setDrafts((prev) => ({ ...prev, [e.role]: { ...d, rate: ev.target.value } }))
                          }
                          className="w-28 rounded-lg border border-zinc-200 px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-zinc-300"
                        />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-zinc-400">
                        {e.updated_by ?? "-"}
                        {e.updated_at && ` · ${formatDateTime(e.updated_at)}`}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-right">
                        {isDirty(e) && (
                          <button
                            onClick={() => saveRow(e.role, d.label, d.rate)}
                            disabled={savingRole === e.role}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                          >
                            {savingRole === e.role ? "กำลังบันทึก..." : "บันทึก"}
                          </button>
                        )}
                        {!core &&
                          (confirmDeleteRole === e.role ? (
                            <span className="ml-2 inline-flex items-center gap-2 text-xs">
                              <button
                                onClick={() => deleteRow(e.role)}
                                className="font-medium text-red-600 hover:underline"
                              >
                                ยืนยันลบ
                              </button>
                              <button
                                onClick={() => setConfirmDeleteRole(null)}
                                className="text-zinc-500 hover:underline"
                              >
                                ยกเลิก
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteRole(e.role)}
                              title="ลบ"
                              className="ml-2 rounded-lg border border-zinc-200 p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={13} />
                            </button>
                          ))}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-start gap-3">
            {!showAdd ? (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Plus size={15} />
                เพิ่มระดับใหม่
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm shadow-zinc-200/60">
                <input
                  value={newRow.label}
                  onChange={(e) => setNewRow((n) => ({ ...n, label: e.target.value }))}
                  placeholder="ชื่อระดับ เช่น Manager-Product"
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
                />
                <input
                  value={newRow.role}
                  onChange={(e) => setNewRow((n) => ({ ...n, role: e.target.value }))}
                  placeholder="key เช่น manager_product"
                  className="w-44 rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-zinc-300"
                />
                <input
                  type="number"
                  value={newRow.rate}
                  onChange={(e) => setNewRow((n) => ({ ...n, rate: e.target.value }))}
                  placeholder="บาท/MD"
                  className="w-28 rounded-lg border border-zinc-200 px-3 py-1.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
                />
                <button
                  onClick={() => saveRow(newRow.role || newRow.label, newRow.label, newRow.rate)}
                  disabled={!(newRow.role || newRow.label) || !newRow.rate || savingRole != null}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  เพิ่ม
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="text-sm text-zinc-500 hover:underline"
                >
                  ยกเลิก
                </button>
              </div>
            )}

            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              <Upload size={15} />
              {importing ? "กำลัง import..." : "Import จาก Excel"}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                disabled={importing}
                onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
              />
            </label>
            <p className="w-full text-xs text-zinc-400">
              รองรับไฟล์ Project Resource Plan (block &quot;Cost Rate&quot; — ใช้ปีล่าสุดในตาราง)
              หรือไฟล์ 2 คอลัมน์ [ระดับ | อัตรา]
            </p>
          </div>

          {importSummary && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <p className="font-medium text-emerald-800">
                Import จาก {importSummary.filename}
                {importSummary.year && ` (อัตราปี ${importSummary.year})`} สำเร็จ
              </p>
              {importSummary.applied.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-zinc-700">
                  {importSummary.applied.map((a) => (
                    <li key={a.role}>
                      {a.label} ({a.role}): {a.from != null ? a.from.toLocaleString() : "ใหม่"} →{" "}
                      <span className="font-medium">{a.to.toLocaleString()}</span> บาท/MD
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-zinc-600">อัตราทั้งหมดตรงกับในระบบอยู่แล้ว ไม่มีการเปลี่ยนแปลง</p>
              )}
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm shadow-zinc-200/60">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <History size={15} />
              ประวัติการแก้ไขอัตรา
            </h2>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-400">ยังไม่มีประวัติการแก้ไข</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {history.map((h) => (
                  <li key={h.id} className="text-xs text-zinc-600">
                    <span className="text-zinc-400">{formatDateTime(h.created_at)}</span> ·{" "}
                    <span className="font-medium">{h.created_by ?? "-"}</span> ·{" "}
                    {ACTION_LABEL[h.action] ?? h.action}{" "}
                    <span className="font-mono">{h.role}</span>
                    {h.action === "delete" ? (
                      <> (เดิม {h.before?.rate?.toLocaleString()} บาท/MD)</>
                    ) : (
                      <>
                        : {h.before?.rate != null ? `${h.before.rate.toLocaleString()} → ` : ""}
                        <span className="font-medium text-zinc-800">
                          {h.after?.rate?.toLocaleString()}
                        </span>{" "}
                        บาท/MD
                        {h.after?.source_file && (
                          <span className="text-zinc-400"> · จากไฟล์ {h.after.source_file}</span>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
