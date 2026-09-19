import { redirect } from "next/navigation";
import { Suspense } from "react";
import { collections } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

function safeNext(raw?: string): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const userCol = await collections.users();
  if ((await userCol.countDocuments()) === 0) redirect("/setup");
  const me = await getCurrentUser();
  if (me) {
    const next = safeNext(searchParams?.next);
    if (next) redirect(next);
    if (me.role === "admin") redirect("/admin");
    if (me.role === "worship") redirect("/worship");
  }
  return (
    <main id="main" className="min-h-screen grid lg:grid-cols-[1.15fr_1fr]">
      {/* Editorial hero — warm, modern, light-filled. The verse is the hero. */}
      <section className="grain relative hidden lg:flex flex-col overflow-hidden bg-ink-900 px-14 py-14 text-parchment-100">
        {/* Golden-hour light spilling in from the top-left, like a high window. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(85% 68% at 16% -12%, rgba(226,181,116,0.55) 0%, rgba(181,122,48,0.16) 36%, transparent 64%), linear-gradient(158deg, #2b241e 0%, #201a16 55%, #141110 100%)",
          }}
        />
        {/* A single, calm architectural arch — the modern sanctuary motif. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 bottom-[-14%] h-[80%] w-[560px] border-t border-l border-brass-400/20"
          style={{ borderTopLeftRadius: "300px 340px" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 bottom-[-14%] h-[62%] w-[420px] border-t border-l border-brass-400/15"
          style={{ borderTopLeftRadius: "230px 270px" }}
        />

        {/* Church name */}
        <p className="relative font-display text-xl font-semibold tracking-tight text-parchment-50 animate-glow-in">
          Evangel Christian Fellowship
        </p>

        {/* Verse — the centered hero */}
        <div className="relative flex flex-1 items-center justify-center">
          <figure className="max-w-2xl text-center animate-rise-in">
            <blockquote className="font-display text-[3.2rem] leading-[1.12] font-medium tracking-tight text-parchment-50">
              &ldquo;Let all things be done decently and in order.&rdquo;
            </blockquote>
            <figcaption className="mt-8 text-sm font-semibold uppercase tracking-[0.28em] text-brass-300">
              1 Corinthians 14:40
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Sign-in panel. */}
      <section className="flex items-center justify-center bg-parchment-50 px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm animate-rise-in">
          <p className="mb-10 font-display text-lg font-semibold tracking-tight text-ink-900 lg:hidden">
            Evangel Christian Fellowship
          </p>

          <p className="eyebrow">Welcome back</p>
          <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink-900">
            Sign in
          </h2>
          <p className="mt-3 text-ink-500">
            Use the email and password your coordinator gave you.
          </p>

          <div className="mt-9">
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
