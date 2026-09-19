import { Suspense } from "react";

import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main id="main" className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-rise-in">
        <div className="mb-8">
          <span className="font-display text-lg font-semibold tracking-tight text-ink-900">ECF Roster</span>
          <span className="block text-[0.62rem] uppercase tracking-[0.2em] text-brass-600">
            Evangel Christian Fellowship
          </span>
        </div>
        <div className="card p-8">
          <p className="eyebrow">Almost there</p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-ink-900">
            Choose a new password
          </h1>
          <div className="mt-6">
            <Suspense fallback={<p className="text-sm text-ink-500">Loading…</p>}>
              <ResetPasswordForm />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}
