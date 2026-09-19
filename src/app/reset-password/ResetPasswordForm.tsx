"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      setValid(false);
      return;
    }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })).catch(() => ({ ok: false as boolean, d: {} })))
      .then(({ ok }) => {
        setValid(ok);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Reset failed. Ask an admin for a new link.");
      setLoading(false);
      return;
    }
    router.push("/login");
  }

  if (checking) {
    return <p className="text-sm text-ink-500">Checking reset link…</p>;
  }

  if (!token || !valid) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-clay-600" role="alert">
          This reset link is invalid or has expired (links last 1 hour and work only
          once). Please ask an admin to generate a new one from Admin → Users.
        </p>
        <Link href="/login" className="btn-secondary w-full text-center">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="label" htmlFor="rp-pw">New password (min 8 characters)</label>
        <input
          id="rp-pw"
          className="input"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
        />
      </div>
      <div>
        <label className="label" htmlFor="rp-pw2">Confirm new password</label>
        <input
          id="rp-pw2"
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
      <button className="btn-brass w-full" disabled={loading}>
        {loading ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
