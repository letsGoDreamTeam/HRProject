"use client";

import { useEffect } from "react";
import type { HrModalProps, HrModalTheme } from "@/types/hr-ui";

const MODAL_SIZE_CLASS = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
} as const;

const THEME_STYLES: Record<
  HrModalTheme,
  { eyebrow: string; iconWrap: string }
> = {
  indigo: {
    eyebrow: "text-indigo-500",
    iconWrap: "bg-indigo-100 text-indigo-600",
  },
  amber: {
    eyebrow: "text-amber-500",
    iconWrap: "bg-amber-100 text-amber-600",
  },
  emerald: {
    eyebrow: "text-emerald-500",
    iconWrap: "bg-emerald-100 text-emerald-600",
  },
};

export default function HrModal({
  isOpen,
  onClose,
  title,
  subtitle,
  eyebrow,
  eyebrowIcon,
  theme = "indigo",
  size = "lg",
  zIndex = 115,
  children,
  footer,
}: HrModalProps) {
  const styles = THEME_STYLES[theme];

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hr-modal-title"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full ${MODAL_SIZE_CLASS[size]} flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-3">
            {eyebrowIcon ? (
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${styles.iconWrap}`}
              >
                <i className={`bx bx-${eyebrowIcon} text-xl`} />
              </div>
            ) : null}
            <div className="min-w-0">
              {eyebrow ? (
                <p
                  className={`text-[11px] font-black uppercase tracking-[0.18em] ${styles.eyebrow}`}
                >
                  {eyebrow}
                </p>
              ) : null}
              <h2
                id="hr-modal-title"
                className="mt-0.5 text-lg font-black text-slate-900 sm:text-xl"
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="mt-1.5 text-sm font-semibold text-slate-500">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-slate-400 transition hover:bg-white hover:text-slate-600"
          >
            <i className="bx bx-x text-2xl" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer ? (
          <footer className="border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6 sm:py-4.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
