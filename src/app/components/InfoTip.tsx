"use client";

// A small ⓘ button that reveals a plain-English explanation on hover (desktop),
// tap (mobile), or keyboard focus. Pulls its text from the shared GLOSSARY so
// every header across the app explains itself the same way.
//
// Accessibility: it's a real <button> (focusable, Enter/Space toggles), the
// bubble is aria-describedby-linked, and Escape closes it. Hover opens it on
// pointer devices; tap toggles it on touch.

import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY } from "@/lib/glossary";

export default function InfoTip({ term }: { term: string }) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleId = useId();

  // Close on outside click/tap and on Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!entry) return null;

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`What does this mean?`}
        aria-expanded={open}
        aria-describedby={open ? bubbleId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-zinc-600 text-[9px] font-bold leading-none text-zinc-400 transition-colors hover:border-emerald-500 hover:text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      >
        i
      </button>
      {open && (
        <span
          id={bubbleId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-1.5 w-56 -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-zinc-200 shadow-lg"
        >
          <span className="block text-zinc-200">{entry.what}</span>
          <span className="mt-1 block text-[11px] text-zinc-400">
            {entry.example}
          </span>
        </span>
      )}
    </span>
  );
}
