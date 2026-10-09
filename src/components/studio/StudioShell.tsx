"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { SonarWordmark } from "../SonarMark";

const NAV = [
  { href: "/feedback", label: "Feedback", icon: "M4 6h12M4 10h12M4 14h7" },
  { href: "/responses", label: "Responses", icon: "M3 10h2l2-5 3 10 3-7 2 2h2" },
  { href: "/insights", label: "Insights", icon: "M10 3v2M10 15v2M3 10h2M15 10h2M10 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" },
  { href: "/library", label: "Library", icon: "M4 4h3v12H4zM9 4h3v12H9zM14 5l2.5-.8 2.6 11.5-2.5.6z" },
  { href: "/settings", label: "Settings", icon: "M4 6h8M15 6h1M4 14h1M8 14h8M12 4v4M5 12v4" },
];

interface Status {
  transcription: { provider: string };
  ai: { provider: string };
}

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    api<Status>("/api/status").then(setStatus).catch(() => {});
  }, []);
  const demo = status?.transcription.provider === "mock";

  return (
    <div className="min-h-screen bg-white md:flex">
      <aside className="sticky top-0 z-10 flex items-center gap-4 border-b border-ink/8 bg-white/90 px-5 py-3 backdrop-blur md:h-screen md:w-60 md:flex-col md:items-stretch md:border-b-0 md:border-r md:px-4 md:py-6">
        <Link href="/feedback" className="md:px-2" aria-label="Sonar home">
          <SonarWordmark />
        </Link>
        <Link
          href="/feedback/new"
          className="ml-auto inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white transition hover:bg-deep md:ml-0 md:mt-8"
        >
          <span aria-hidden className="text-lg leading-none">+</span> New Sonar
        </Link>
        <nav aria-label="Main" className="hidden md:mt-6 md:flex md:flex-col md:gap-0.5">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[0.95rem] font-medium transition ${
                  active ? "bg-cloud text-ink" : "text-ink/55 hover:bg-cloud/70 hover:text-ink"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d={n.icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {n.label}
              </Link>
            );
          })}
        </nav>
        {demo && (
          <Link
            href="/settings"
            className="hidden items-center gap-2 rounded-xl px-3 py-2 text-xs text-ink/50 hover:text-ink md:mt-auto md:flex"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" aria-hidden />
            Demo mode
          </Link>
        )}
      </aside>
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-b border-ink/8 px-4 py-2 md:hidden">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${active ? "bg-cloud text-ink" : "text-ink/55"}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <main className="min-w-0 flex-1 px-5 py-8 md:px-12 md:py-12">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
