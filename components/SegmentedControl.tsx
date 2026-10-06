"use client";

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}

// Pill-style switcher shared by the search and quotation pages — the active
// segment is a brand-gradient pill. Was hand-copied (and had drifted) in each.
export default function SegmentedControl<T extends string>({ value, onChange, options }: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex rounded-full border border-[var(--hairline)] bg-white p-1 shadow-[var(--shadow-card)]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
            value === o.value ? "shadow-sm shadow-red-300/50" : "text-slate-500 hover:text-slate-900"
          }`}
          style={value === o.value ? { background: "var(--brand-gradient)", color: "#fff" } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
