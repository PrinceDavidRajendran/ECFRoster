import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import RulesEditor from "./RulesEditor";

export default async function RulesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  return (
    <>
      <Navbar user={me} active="admin" />
      <main id="main" className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Rostering Rules</h1>
        <RulesEditor />
      </main>
    </>
  );
}
