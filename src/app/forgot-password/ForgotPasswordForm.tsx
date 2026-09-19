"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // ignore — message below is generic either way
    }
    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-700">
          If an account exists for <strong>{email}</strong>, a reset link has been
          prepared. This church app doesn&apos;t send email automatically, so please{" "}
          <strong>contact your admin</strong> (WhatsApp / Telegram / in person) and
          ask them to generate a password-reset link for you from Admin → Users.
        </p>
        <p className="text-sm text-ink-500">
          Reset links expire after 1 hour and can only be used once.
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
        <label className="label" htmlFor="fp-email">Account email</label>
        <input
          id="fp-email"
          className="input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@ecf.church"
          autoFocus
        />
      </div>
      <button className="btn-brass w-full" disabled={loading}>
        {loading ? "Checking…" : "Request password reset"}
      </button>
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-brass-700 hover:text-brass-600">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
