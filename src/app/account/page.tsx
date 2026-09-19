import { redirect } from "next/navigation";
import { collections } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function AccountPage() {
  const userCol = await collections.users().catch(() => null);
  const count = userCol ? await userCol.countDocuments().catch(() => 1) : 1;
  if (count === 0) redirect("/setup");
  const me = await getCurrentUser().catch(() => null);
  if (!me) redirect("/login");

  return (
    <>
      <Navbar user={{ name: me.name, role: me.role, email: me.email }} />
      <main id="main" className="max-w-xl mx-auto px-4 sm:px-6 py-10">
        <p className="eyebrow">Your account</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900">
          Change password
        </h1>
        <div className="card p-6 mt-6">
          <ChangePasswordForm email={me.email} />
        </div>
      </main>
    </>
  );
}
