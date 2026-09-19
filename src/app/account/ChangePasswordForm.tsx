"use client";

import { useState } from "react";

export default function ChangePasswordForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Change failed.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
    setSuccess(true);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-ink-500">
        Signed in as <strong className="text-ink-700">{email}</strong>
      </p>
      <div>
        <label className="label" htmlFor="cp-current">Current password</label>
        <input
          id="cp-current"
          className="input"
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div>
        <label className="label" htmlFor="cp-new">New password (min 8 characters)</label>
        <input
          id="cp-new"
          className="input"
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div>
        <label className="label" htmlFor="cp-confirm">Confirm new password</label>
        <input
          id="cp-confirm"
          className="input"
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      {error && <p className="text-sm text-clay-600" role="alert">{error}</p>}
      {success && <p className="text-sm text-green-700" role="status">Password updated.</p>}
      <button className="btn-primary" disabled={loading}>
        {loading ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
