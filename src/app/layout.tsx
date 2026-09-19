import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";

// Display serif — warm, humanist, a little characterful. Carries the
// "illuminated manuscript" personality of the masthead and headings.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

// Body / UI face — clean and legible for dense roster tables.
const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ECF Roster — Evangel Christian Fellowship",
  description: "Plan, review, and share the weekly service roster for Evangel Christian Fellowship.",
};

export const viewport: Viewport = {
  themeColor: "#1a2340",
};

// Every page branches on live DB + session state — never prerender or
// edge-cache HTML, otherwise /setup and /login can serve stale build-time
// output after the database changes.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${instrument.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
