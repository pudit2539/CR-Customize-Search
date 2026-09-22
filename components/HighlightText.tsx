import { Fragment } from "react";

// Escapes regex metacharacters so a query containing them (e.g. "1 บัญชี
// (default)") doesn't throw when built into a RegExp below.
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Highlights each word of `query` wherever it appears in `text` — a plain
// whitespace split rather than real tokenization, but the search box's own
// placeholder/example queries are space-separated phrases, so this lines up
// with how people actually type here. Words under 2 characters are skipped
// so common short particles don't light up half the sentence.
export default function HighlightText({ text, query }: { text: string; query: string }) {
  const words = [...new Set(query.split(/\s+/).filter((w) => w.length >= 2))].sort(
    (a, b) => b.length - a.length
  );
  if (words.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="search-highlight">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}
