"use client";

// A small ⓘ button that reveals a plain-English explanation on hover (desktop),
// tap (mobile), or keyboard focus. Pulls its text from the shared GLOSSARY so
// every header across the app explains itself the same way.
//
// The bubble renders in a fixed-position portal on <body> so it can never be
// clipped by an ancestor's overflow (e.g. a table's overflow-x-auto scroll box
// or an overflow-hidden card). It's positioned from the button's on-screen rect
// and flips below the icon when there isn't room above.
//
// Accessibility: it's a real <button> (focusable, Enter/Space toggles), the
// bubble is aria-describedby-linked, and Escape closes it. Hover opens it on
// pointer devices; tap toggles it on touch.

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GLOSSARY } from "@/lib/glossary";

const BUBBLE_W = 288; // w-72 — roomy enough for a fuller breakdown + lingo line
const GAP = 8; // space between icon and bubble

type Pos = { top: number; left: number; below: boolean };

export default function InfoTip({ term }: { term: string }) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleId = useId();

  useEffect(() => setMounted(true), []);

  // Measure the button and place the bubble in viewport (fixed) coordinates.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const center = r.left + r.width / 2;
      // Keep the bubble within the viewport horizontally.
      const half = BUBBLE_W / 2;
      const left = Math.max(half + 4, Math.min(center, window.innerWidth - half - 4));
      // Flip below if there isn't room above.
      const below = r.top < 96;
      const top = below ? r.bottom + GAP : r.top - GAP;
      setPos({ top, left, below });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

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
        ref={btnRef}
        type="button"
        aria-label="What does this mean?"
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
      {open &&
        mounted &&
        pos &&
        createPortal(
          <span
            id={bubbleId}
            role="tooltip"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: `translateX(-50%) translateY(${pos.below ? "0" : "-100%"})`,
              width: BUBBLE_W,
            }}
            className="z-50 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-zinc-200 shadow-lg"
          >
            <span className="block leading-5 text-zinc-200">{entry.what}</span>
            <span className="mt-1.5 block text-[11px] leading-4 text-zinc-400">
              {entry.example}
            </span>
            {entry.lingo && (
              <span className="mt-2 block border-t border-zinc-800 pt-1.5 text-[11px] leading-4 text-emerald-400/90">
                🗣️ Pros call it: <span className="text-emerald-300">{entry.lingo}</span>
              </span>
            )}
          </span>,
          document.body,
        )}
    </span>
  );
}
