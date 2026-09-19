"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Only allow same-origin relative paths to prevent open-redirect attacks.
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  // Must start with a single "/" and not "//" or "/\" (protocol-relative).
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return null;
  }
  return raw;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = safeNext(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      const role = data.user?.role;
      // If a safe return URL was provided, honour it; otherwise go to the
      // role's home page.
      if (nextUrl) {
        router.push(nextUrl);
      } else if (role === "admin") router.push("/admin");
      else if (role === "worship") router.push("/worship");
      else router.push("/");
    } catch (err) {
      setError(String((err as Error).message));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="label" htmlFor="login-email">Email</label>
        <input
          id="login-email"
          className="input"
          type="email"
          name="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          spellCheck={false}
          placeholder="you@ecf.church"
          autoFocus
        />
      </div>
      <div>
        <label className="label" htmlFor="login-password">Password</label>
        <input
          id="login-password"
          className="input"
          type="password"
          name="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      {error && (
        <p className="text-sm text-clay-600" role="alert" aria-live="polite">
          {error}
        </p>
      )}
      <button className="btn-brass w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm">
        <a href="/forgot-password" className="font-medium text-brass-700 hover:text-brass-600">
          Forgot your password?
        </a>
      </p>
    </form>
  );
}
