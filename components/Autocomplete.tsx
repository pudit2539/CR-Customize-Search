"use client";

import { useEffect, useRef, useState } from "react";

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  suggestionType: "query" | "project";
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  rows?: number;
}

// Shared free-text input: debounced suggestions from /api/suggestions (past
// search queries or known project/client names), arrow-key navigation, Enter
// to search — picking a suggestion searches immediately, same as a browser
// address-bar history dropdown. Shift+Enter still inserts a newline in
// multiline mode so pasting a multi-line requirement isn't disrupted.
export default function Autocomplete({
  value,
  onChange,
  onSubmit,
  suggestionType,
  placeholder,
  className = "",
  multiline = false,
  rows = 1,
}: AutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/suggestions?type=${suggestionType}&q=${encodeURIComponent(value.trim())}`)
        .then((r) => r.json())
        .then((json) => {
          setSuggestions(json.suggestions ?? []);
          setHighlighted(-1);
        })
        .catch(() => {});
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, suggestionType]);

  function pick(suggestion: string) {
    onChange(suggestion);
    onSubmit(suggestion);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      if (open && suggestions.length > 0) {
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
      }
      return;
    }
    if (e.key === "ArrowUp") {
      if (open && suggestions.length > 0) {
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, -1));
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      if (multiline && e.shiftKey) return; // allow newline
      e.preventDefault();
      if (open && highlighted >= 0 && suggestions[highlighted]) {
        pick(suggestions[highlighted]);
      } else {
        setOpen(false);
        onSubmit(value);
      }
    }
  }

  const sharedProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onFocus: () => setOpen(true),
    onBlur: () => {
      // Delay so a click on a suggestion registers before the list unmounts.
      blurTimeoutRef.current = setTimeout(() => setOpen(false), 150);
    },
    onKeyDown: handleKeyDown,
    placeholder,
    className,
    autoComplete: "off" as const,
  };

  return (
    <div className="relative">
      {multiline ? <textarea rows={rows} {...sharedProps} /> : <input type="text" {...sharedProps} />}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg">
          {suggestions.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`block w-full truncate px-3 py-1.5 text-left ${
                  i === highlighted ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
