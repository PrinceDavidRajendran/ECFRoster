import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import ServiceRosterPage from "./ServiceRosterPage";

export default async function ServicePage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const me = await getCurrentUser();
  if (!me) {
    // Preserve where the user was heading so they land back here after login.
    const month = searchParams?.month;
    const next = month ? `/service?month=${encodeURIComponent(month)}` : "/service";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (me.role !== "admin") redirect("/");
  return (
    <>
      <Navbar user={me} active="service" />
      <main id="main" className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <ServiceRosterPage isAdmin={me.role === "admin"} />
      </main>
    </>
  );
}
