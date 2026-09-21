// Deterministic color-per-name assignment for tag pills (project names,
// module codes, etc.) — same name always gets the same color without a DB
// column, since the palette index comes from the name's own first char.
const PALETTE = [
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-lime-100 text-lime-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-cyan-100 text-cyan-700",
];

export function tagColor(seed: string | null | undefined): string {
  if (!seed) return "bg-zinc-100 text-zinc-500";
  const idx = seed.charCodeAt(0) % PALETTE.length;
  return PALETTE[idx];
}
