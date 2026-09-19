"use client";

import { useState } from "react";
import { monthLabel } from "@/lib/dates";
import type { RosterStatus } from "@/lib/types";

interface Light {
  _id: string;
  month: string;
  status: RosterStatus;
  updatedAt: string;
}

export default function AdminDashboard({ rosters }: { rosters: Light[] }) {
  const [month, setMonth] = useState(nextMonth());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgResult, setTgResult] = useState<string | null>(null);

  async function createRoster() {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Failed to create month");
      return;
    }
    window.location.href = `/service?month=${month}`;
  }

  async function deleteRoster(id: string, monthStr: string, status: RosterStatus) {
    const label = monthLabel(monthStr);
    const warn =
      status === "APPROVED"
        ? `⚠️ "${label}" is an APPROVED roster. Deleting it is permanent and cannot be undone. Continue?`
        : `Delete roster for ${label}? This cannot be undone.`;
    if (!confirm(warn)) return;
    setDeleting(id);
    const res = await fetch(`/api/roster/${id}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete");
      return;
    }
    window.location.reload();
  }

  async function testTelegram() {
    setTgTesting(true);
    setTgResult(null);
    try {
      const res = await fetch("/api/telegram/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setTgResult(
        res.ok
          ? "✓ Test message sent — check the Telegram group."
          : `✗ Telegram failed: ${data.error || "unknown error"}. Check TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID in Vercel env vars (then redeploy).`
      );
    } catch (e) {
      setTgResult(`✗ Telegram failed: ${String((e as Error).message)}`);
    }
    setTgTesting(false);
  }

  return (
    <div className="space-y-8">
      {/* Notifications */}
      <section className="card p-6">
        <p className="eyebrow">Notifications</p>
        <h2 className="mt-2 font-display text-xl font-semibold text-ink-900">Telegram</h2>
        <p className="mt-1 text-sm text-ink-500">
          Submit/approve actions notify the group chat. Send a test to verify the bot wiring.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn-secondary" disabled={tgTesting} onClick={testTelegram}>
            {tgTesting ? "Sending…" : "Test Telegram"}
          </button>
          {tgResult && (
            <span className="text-sm text-ink-700" role="status" aria-live="polite">
              {tgResult}
            </span>
          )}
        </div>
      </section>
      {/* New month */}
      <section className="card p-6 animate-rise-in">
        <p className="eyebrow">Begin a month</p>
        <h2 className="mt-2 font-display text-xl font-semibold text-ink-900">Open a new roster month</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="new-month">Month</label>
            <input
              id="new-month"
              type="month"
              className="input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <button className="btn-brass" disabled={busy} onClick={createRoster}>
            {busy ? "Creating…" : "Create Month"}
          </button>
          {error && (
            <span className="text-sm text-clay-600" role="alert" aria-live="polite">
              {error}
            </span>
          )}
        </div>
      </section>

      {/* All rosters */}
      <section className="card p-6">
        <p className="eyebrow">The record</p>
        <h2 className="mt-2 font-display text-xl font-semibold text-ink-900">All rosters</h2>
        {rosters.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-ink-100 bg-parchment-100/50 px-6 py-10 text-center">
            <p className="font-medium text-ink-700">No rosters yet</p>
            <p className="mt-1 text-sm text-ink-500">Create your first month above to get started.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-400 border-b border-ink-100">
                  <th className="py-2.5 font-semibold">Month</th>
                  <th className="py-2.5 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold">Last Updated</th>
                  <th className="py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {rosters.map((r) => (
                  <tr
                    key={r._id}
                    className="border-b border-ink-100/60 last:border-0 transition-colors hover:bg-parchment-100/60"
                  >
                    <td className="py-3 font-medium text-ink-800">{monthLabel(r.month)}</td>
                    <td className="py-3"><StatusBadge status={r.status} /></td>
                    <td className="py-3 text-ink-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {new Date(r.updatedAt).toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          className="text-sm font-medium text-clay-600 hover:text-clay-500 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay-500/50"
                          disabled={deleting === r._id}
                          onClick={() => deleteRoster(r._id, r.month, r.status)}
                        >
                          {deleting === r._id ? "Deleting…" : "Delete"}
                        </button>
                        <a
                          className="text-sm font-semibold text-ink-700 hover:text-brass-600"
                          href={`/service?month=${r.month}`}
                        >
                          Open &rarr;
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: RosterStatus }) {
  const map: Record<RosterStatus, string> = {
    DRAFT: "bg-ink-50 text-ink-600",
    WORSHIP_FILLED: "bg-brass-100 text-brass-700",
    SERVICE_FILLED: "bg-ink-100 text-ink-700",
    APPROVED: "bg-sage-100 text-sage-700",
  };
  return (
    <span className={`badge ${map[status]}`}>{status.replace("_", " ")}</span>
  );
}

function nextMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
