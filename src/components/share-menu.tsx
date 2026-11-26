"use client";

import { useEffect, useId, useRef, useState } from "react";
import { whatsappShareUrl } from "@/lib/share";

/**
 * Menu de partage maison.
 *
 * Le partage natif du système (`navigator.share`) est volontairement ignoré :
 * sur Windows il ouvre un carré noir / la feuille de partage de l'OS. On
 * propose donc toujours les deux actions utiles, visibles et prévisibles :
 * WhatsApp et copie du lien.
 */
export function ShareMenu({
  message,
  url,
  label,
  className = "btn-secondary",
  copiedLabel = "Lien copié !",
}: {
  message: string;
  url: string;
  label: string;
  className?: string;
  copiedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      return;
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé / permission) :
      // on retombe sur une sélection manuelle du lien.
    }

    try {
      const field = document.createElement("textarea");
      field.value = url;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      document.body.removeChild(field);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="menu"
        className={className}
      >
        {label}
      </button>

      {open ? (
        <div
          id={panelId}
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <a
            role="menuitem"
            href={whatsappShareUrl(message)}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-emerald-50 dark:text-slate-100 dark:hover:bg-emerald-500/10"
          >
            <span aria-hidden>💬</span>
            Partager sur WhatsApp
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={copyLink}
            className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <span aria-hidden>🔗</span>
            {copied ? copiedLabel : "Copier le lien"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
