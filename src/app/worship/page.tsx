import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import WorshipRosterPage from "./WorshipRosterPage";

export default async function WorshipPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "worship" && me.role !== "admin") redirect("/");
  return (
    <>
      <Navbar user={me} active="worship" />
      <main id="main" className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <WorshipRosterPage isAdmin={me.role === "admin"} />
      </main>
    </>
  );
}
