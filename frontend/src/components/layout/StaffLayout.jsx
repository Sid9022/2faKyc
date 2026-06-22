import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { getCurrentUser, logout } from "../../api/kycApi";

/**
 * Shared dark-sidebar shell for the staff console (admin + reviewer).
 * Pure presentation — no data fetching, no routing decisions.
 *
 * Props:
 *   title, subtitle   — page heading in the content area
 *   actions           — right-side top-bar slot (e.g. Refresh button)
 *   active            — key of the active nav item
 *   navItems          — [{ key, label, icon, to?, onClick?, trailing? }]
 *                       `to` renders a <Link>; otherwise a button calling onNavItem(key)
 *   onNavItem(key)    — called for button nav items (e.g. admin tab switch)
 *   children          — page content
 */
function initials(name = "") {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function NavList({ navItems, active, onNavItem, onNavigate }) {
  return (
    <nav className="flex-1 space-y-1 px-3">
      {navItems.map((item) => {
        const isActive = active === item.key;
        const base = `flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
          isActive
            ? "bg-white/10 text-white"
            : "text-white/60 hover:bg-white/5 hover:text-white"
        }`;
        const Icon = item.icon;
        const inner = (
          <>
            {Icon ? <Icon size={18} /> : null}
            <span className="flex-1">{item.label}</span>
            {item.trailing || null}
          </>
        );

        if (item.to) {
          return (
            <Link key={item.key} to={item.to} onClick={onNavigate} className={base}>
              {inner}
            </Link>
          );
        }

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              if (item.onClick) item.onClick();
              else onNavItem?.(item.key);
              onNavigate?.();
            }}
            className={`${base} w-full text-left`}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}

function SidebarInner({ navItems, active, onNavItem, onNavigate, user, onLogout }) {
  return (
    <div className="flex h-full flex-col bg-navy text-white">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
          <ShieldCheck size={20} />
        </div>
        <div>
          <p className="text-sm font-extrabold tracking-tight">2Factor.in</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            {user?.role === "admin" ? "Admin Console" : "Reviewer Console"}
          </p>
        </div>
      </div>

      <NavList
        navItems={navItems}
        active={active}
        onNavItem={onNavItem}
        onNavigate={onNavigate}
      />

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold">
            {initials(user?.fullName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{user?.fullName}</p>
            <p className="truncate text-xs capitalize text-white/50">{user?.role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/5"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function StaffLayout({
  title,
  subtitle,
  actions,
  headerActions,
  active,
  navItems = [],
  onNavItem,
  children
}) {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const sidebarProps = {
    navItems,
    active,
    onNavItem,
    user,
    onLogout: handleLogout
  };

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 left-0 w-64">
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
          <div className="absolute inset-y-0 left-0 w-72">
            <div className="relative h-full">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="absolute right-3 top-5 z-10 text-white/70 hover:text-white"
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

      <div className="min-w-0 flex-1">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>

            <div className="min-w-0 flex-1" />

            <div className="flex items-center gap-2">
              {actions}
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400">
                <Bell size={17} />
              </span>
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 py-1.5 pl-1.5 pr-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy text-[11px] font-bold text-white">
                  {initials(user?.fullName)}
                </span>
                <div className="hidden leading-tight sm:block">
                  <p className="text-xs font-bold text-navy">{user?.fullName}</p>
                  <p className="text-[10px] capitalize text-slate-400">{user?.role}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          {title ? (
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-extrabold tracking-tight text-navy">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
                ) : null}
              </div>
              {headerActions ? (
                <div className="shrink-0">{headerActions}</div>
              ) : null}
            </div>
          ) : null}

          {children}
        </main>
      </div>
    </div>
  );
}
