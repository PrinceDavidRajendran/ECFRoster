import { redirect } from "next/navigation";
import { collections } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  // First-run check: if no users, force setup.
  const userCol = await collections.users();
  const count = await userCol.countDocuments();
  if (count === 0) redirect("/setup");

  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role === "admin") redirect("/admin");
  if (me.role === "worship") redirect("/worship");
  redirect("/login");
}
