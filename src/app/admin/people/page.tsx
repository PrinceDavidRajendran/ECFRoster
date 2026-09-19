import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import PeopleManager from "./PeopleManager";

export default async function PeoplePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  return (
    <>
      <Navbar user={me} active="admin" />
      <main id="main" className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">People</h1>
        <PeopleManager />
      </main>
    </>
  );
}
