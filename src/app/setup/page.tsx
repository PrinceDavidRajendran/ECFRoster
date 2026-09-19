import { redirect } from "next/navigation";
import { collections } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import SetupForm from "./SetupForm";

export default async function SetupPage() {
  const userCol = await collections.users();
  if ((await userCol.countDocuments()) > 0) {
    // Setup already done. If logged in as admin, go to admin; else login.
    const me = await getCurrentUser();
    if (me && me.role === "admin") redirect("/admin");
    redirect("/login");
  }
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
          <p className="eyebrow">First things first</p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-ink-900">
            Welcome — let&apos;s set up
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Create the first <strong className="text-ink-700">Admin</strong> account to get started.
            You can add other coordinators from Admin → Users later.
          </p>
          <div className="mt-6">
            <SetupForm />
          </div>
        </div>
      </div>
    </main>
  );
}
