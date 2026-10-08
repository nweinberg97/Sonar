"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { TEMPLATES } from "@/lib/templates";
import { ErrorNote } from "./ui";

export function NewSonar() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const create = async (template: string) => {
    setBusy(template);
    setError("");
    try {
      const { session } = await api<{ session: { id: string } }>("/api/sessions", { method: "POST", json: { template } });
      router.push(`/feedback/${session.id}?new=1`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em]">What are you trying to learn?</h1>
      <p className="mt-4 text-lg text-ink/60">Pick a starting point. You can change every question on the next screen.</p>
      {error && (
        <div className="mt-6">
          <ErrorNote message={error} />
        </div>
      )}
      <ul className="mt-10 grid gap-2">
        {TEMPLATES.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => create(t.id)}
              disabled={busy !== null}
              className="group flex w-full items-center gap-5 rounded-2xl border border-ink/10 px-5 py-4 text-left transition hover:border-ink/30 hover:bg-cloud/60 disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">{t.label}</span>
                <span className="mt-0.5 block text-ink/55">{t.hint}</span>
              </span>
              <span className="hidden max-w-[16rem] truncate text-sm text-ink/40 italic sm:block">&ldquo;{t.questions[0]}&rdquo;</span>
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${
                  busy === t.id ? "bg-blue text-white" : "bg-ink/[0.05] text-ink/50 group-hover:bg-ink group-hover:text-white"
                }`}
                aria-hidden
              >
                {busy === t.id ? (
                  <span className="h-2 w-2 rounded-full bg-white animate-breathe" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7h8M7.5 3.5 11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
