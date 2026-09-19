"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";

export default function Navbar({
  user,
  active,
}: {
  user: { name: string; role: Role; email: string };
  active?: "admin" | "worship" | "service";
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/70 bg-parchment-50/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-16 gap-4 sm:gap-6">
        <Link href="/" className="group flex flex-col leading-none shrink-0" aria-label="ECF Roster home">
          <span className="font-display text-lg font-semibold tracking-tight text-ink-900 transition-colors group-hover:text-brass-600">
            ECF Roster
          </span>
          <span className="hidden sm:block text-[0.62rem] uppercase tracking-[0.2em] text-brass-600">
            Evangel Christian Fellowship
          </span>
        </Link>

        <nav className="flex gap-0.5 text-sm overflow-x-auto" aria-label="Primary">
          {user.role === "admin" && (
            <>
              <NavLink href="/admin" active={active === "admin"}>Dashboard</NavLink>
              <NavLink href="/admin/users">Users</NavLink>
              <NavLink href="/admin/people">People</NavLink>
              <NavLink href="/admin/rules">Rules</NavLink>
              <NavLink href="/service">Roster</NavLink>
            </>
          )}
          {user.role === "worship" && (
            <NavLink href="/worship" active={active === "worship"}>My Roster</NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden sm:flex flex-col items-end leading-tight">
            <span className="font-medium text-ink-800">{user.name}</span>
            <span className="text-xs text-brass-600">{ROLE_LABELS[user.role]}</span>
          </span>
          <Link href="/account" className="font-medium text-ink-600 hover:text-ink-900">
            Account
          </Link>
          <button onClick={logout} className="btn-secondary text-sm px-3 py-1.5">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
  active,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap px-3 py-1.5 rounded-lg font-medium transition-colors ${
        active
          ? "bg-ink-800 text-parchment-50"
          : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
      }`}
    >
      {children}
    </Link>
  );
}
