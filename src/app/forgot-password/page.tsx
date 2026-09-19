import { redirect } from "next/navigation";
import { collections } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  const userCol = await collections.users().catch(() => null);
  const count = userCol ? await userCol.countDocuments().catch(() => 1) : 1;
  if (count === 0) redirect("/setup");
  const me = await getCurrentUser().catch(() => null);
  if (me) redirect(me.role === "admin" ? "/admin" : "/worship");

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
          <p className="eyebrow">Locked out?</p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-ink-900">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Enter your account email. An admin will send you a one-time reset link.
          </p>
          <div className="mt-6">
            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </main>
  );
}
