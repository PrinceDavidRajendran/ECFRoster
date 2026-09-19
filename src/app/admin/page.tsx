import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { collections } from "@/lib/db";
import Navbar from "@/components/Navbar";
import AdminDashboard from "./AdminDashboard";
import type { Roster } from "@/lib/types";

export default async function AdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");

  const col = await collections.rosters();
  const rosters = (await col.find({}).sort({ month: -1 }).toArray()) as Roster[];
  const payload = rosters.map((r) => ({
    _id: String(r._id),
    month: r.month,
    status: r.status,
    updatedAt: String(r.updatedAt),
  }));

  return (
    <>
      <Navbar user={me} active="admin" />
      <main id="main" className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <AdminDashboard rosters={payload} />
      </main>
    </>
  );
}
