import { useState } from "react";
import { Globe2, LockKeyhole, Menu, ShieldCheck, X } from "lucide-react";
import LanguageToggle from "../LanguageToggle";

/**
 * Shared shell for the public KYC link screens (welcome / consent / docs / video).
 * Mirrors StaffLayout so the buyer portal feels like part of the same product
 * as the admin / reviewer consoles, but is sessionless (no logout, no user chip).
 *
 * Props:
 *   step          — current step key ("welcome" | "consent" | ...). Drives the
 *                   sidebar step indicator + the top progress bar.
 *   steps         — ordered list of { key, label } for the stepper.
 *   buyerName     — used in the sidebar greeting (decrypted server-side, no PII
 *                   risk; this component only renders what it is given).
 *   entityLabel   — e.g. "Individual" / "Company" — shown under the greeting.
 *   language / onLanguageChange — wired to the top language toggle.
 *   children      — page content (rendered inside the white content column).
 */
function StepList({ steps, active }) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === active)
  );

  return (
    <nav aria-label="Progress" className="flex-1 px-3">
      <ol className="space-y-1">
        {steps.map((step, index) => {
          const isActive = step.key === active;
          const isDone = index < activeIndex;
          const dot = isDone
            ? "bg-white text-navy"
            : isActive
              ? "bg-white text-navy ring-2 ring-white/30"
              : "bg-white/10 text-white/60";

          return (
            <li
              key={step.key}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${dot}`}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="flex-1 truncate">{step.label}</span>
              {isDone ? (
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                  Done
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SidebarInner({
  steps,
  active,
  buyerName,
  entityLabel,
  onNavigate
}) {
  return (
    <div className="flex h-full flex-col bg-navy text-white">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
          <ShieldCheck size={20} />
        </div>
        <div>
          <p className="text-sm font-extrabold tracking-tight">2Factor.in</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Secure KYC link
          </p>
        </div>
      </div>

      <div className="mx-4 mb-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
          Welcome
        </p>
        <p className="mt-0.5 truncate text-sm font-bold">{buyerName || "—"}</p>
        {entityLabel ? (
          <p className="mt-0.5 truncate text-xs text-white/50">{entityLabel}</p>
        ) : null}
      </div>

      <StepList steps={steps} active={active} />

      <div className="border-t border-white/10 p-4">
        <div className="flex items-start gap-3 rounded-xl bg-white/5 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
            <LockKeyhole size={16} />
          </div>
          <div>
            <p className="text-xs font-bold leading-tight">
              End-to-end encrypted
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-white/55">
              Every action is logged with timestamp and device details for audit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sticky bottom progress bar — only visible on mobile (<lg). Mirrors the
 * sidebar stepper so the buyer always knows where they are, even with the
 * drawer closed.
 */
function MobileProgress({ steps, active }) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === active)
  );
  const pct = Math.round(((activeIndex + 1) / steps.length) * 100);

  return (
    <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden"
         style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Step {activeIndex + 1} of {steps.length}
          </p>
          <p className="truncate text-sm font-semibold text-navy">
            {steps[activeIndex]?.label || ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-extrabold text-navy">{pct}%</p>
          <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-navy transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BuyerLayout({
  step,
  steps = [],
  buyerName,
  entityLabel,
  language,
  onLanguageChange,
  children
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sidebarProps = {
    steps,
    active: step,
    buyerName,
    entityLabel
  };

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-canvas lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 lg:block">
        <div className="fixed inset-y-0 left-0 w-72">
          <SidebarInner {...sidebarProps} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] min-w-0">
            <div className="relative h-full">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="absolute right-3 top-5 z-10 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
              <SidebarInner
                {...sidebarProps}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 max-w-[100vw] flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 lg:px-8"
               style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>

            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy text-white">
                <ShieldCheck size={18} />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-extrabold tracking-tight text-navy">
                  2Factor KYC
                </p>
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Secure verification
                </p>
              </div>
            </div>

            <div className="flex-1" />

            {language && onLanguageChange ? (
              <div className="flex shrink-0 items-center gap-2">
                <Globe2
                  size={16}
                  className="text-slate-400 hidden sm:block"
                  aria-hidden="true"
                />
                <LanguageToggle language={language} onChange={onLanguageChange} />
              </div>
            ) : null}
          </div>
        </header>

        {/* Page content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <div className="mx-auto w-full min-w-0 max-w-5xl">{children}</div>
        </main>

        {/* Mobile-only sticky progress */}
        <MobileProgress steps={steps} active={step} />
      </div>
    </div>
  );
}