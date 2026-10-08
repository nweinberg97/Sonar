"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { btn, ErrorNote, Loading, PageHeader, SessionPicker, useSessions } from "./ui";

interface Status {
  transcription: { provider: string; model: string; misconfigured: boolean };
  ai: { provider: string; model: string; misconfigured: boolean };
  demoTools: boolean;
}

const NAMES: Record<string, string> = { mock: "Demo", openai: "OpenAI", groq: "Groq", anthropic: "Anthropic" };

export function SettingsView() {
  const [status, setStatus] = useState<Status | null>(null);
  const { sessions } = useSessions();
  const [target, setTarget] = useState("");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Status>("/api/status").then(setStatus).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!target && sessions?.length) setTarget(sessions[0].id);
  }, [sessions, target]);

  const run = async (action: string, extra: Record<string, unknown> = {}, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(action);
    setNote("");
    setError("");
    try {
      const r = await api<{ message: string }>("/api/demo", { method: "POST", json: { action, ...extra } });
      setNote(r.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!status && !error) return <Loading />;

  return (
    <>
      <PageHeader title="Settings" />

      {status && (
        <section className="mb-14" aria-labelledby="providers">
          <h2 id="providers" className="font-display text-xl font-semibold tracking-tight">
            Voice and AI
          </h2>
          <dl className="mt-5 divide-y divide-ink/8 border-y border-ink/8">
            <Provider label="Speech to text" p={status.transcription} />
            <Provider label="Insights" p={status.ai} />
          </dl>
          {(status.transcription.provider === "mock" || status.ai.provider === "mock") && (
            <div className="mt-6 rounded-2xl bg-cloud p-5 text-[0.95rem] leading-relaxed text-ink/75">
              <p>
                Sonar is running in demo mode. Recording works for real, but transcripts come from a sample bank and insights from
                the built-in extractor. To go live, add keys to <code className="rounded bg-white px-1.5 py-0.5 text-sm">.env</code> and restart:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-sm leading-relaxed text-white/85">
{`TRANSCRIPTION_PROVIDER=openai   # or groq
TRANSCRIPTION_API_KEY=...
AI_PROVIDER=anthropic           # or openai, groq
AI_API_KEY=...`}
              </pre>
            </div>
          )}
          <p className="mt-6 text-sm text-ink/50">
            Audio is sent for transcription and then discarded. Sonar stores transcripts and insights only, with no names or emails.
          </p>
        </section>
      )}

      {status?.demoTools && (
        <section aria-labelledby="testing">
          <h2 id="testing" className="font-display text-xl font-semibold tracking-tight">
            Testing tools
          </h2>
          <p className="mt-2 text-ink/60">For running user tests. Available in development, or when SONAR_DEMO_TOOLS=true.</p>

          {note && (
            <p role="status" className="mt-5 rounded-2xl bg-lime/60 px-4 py-3 text-sm font-medium">
              {note}
            </p>
          )}
          {error && (
            <div className="mt-5">
              <ErrorNote message={error} />
            </div>
          )}

          <div className="mt-6 divide-y divide-ink/8 border-y border-ink/8">
            <Tool title="Generate sample responses" body="Adds realistic spoken answers, then runs them through insights.">
              {sessions && sessions.length > 0 && <SessionPicker sessions={sessions} value={target} onChange={setTarget} />}
              <select
                aria-label="How many respondents"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="h-10 rounded-full border border-ink/12 bg-white px-4 text-[0.95rem]"
              >
                {[1, 5, 10, 20].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "person" : "people"}
                  </option>
                ))}
              </select>
              <button className={btn.dark} disabled={!target || busy !== null} onClick={() => run("generate", { sessionId: target, count })}>
                {busy === "generate" ? "Generating…" : "Generate"}
              </button>
            </Tool>
            <Tool title="Clear responses" body="Removes every response to the selected Sonar. Questions stay.">
              <button
                className={btn.ghost}
                disabled={!target || busy !== null}
                onClick={() => run("clear", { sessionId: target }, "Remove every response to this Sonar?")}
              >
                {busy === "clear" ? "Clearing…" : "Clear responses"}
              </button>
            </Tool>
            <Tool title="Reset workspace" body="Deletes everything and reloads the Forth Community demo.">
              <button
                className={btn.ghost}
                disabled={busy !== null}
                onClick={() => run("reset", {}, "Delete every Sonar and response, and reload the demo data?")}
              >
                {busy === "reset" ? "Resetting…" : "Reset to demo data"}
              </button>
            </Tool>
          </div>
        </section>
      )}
    </>
  );
}

function Provider({ label, p }: { label: string; p: Status["ai"] }) {
  const live = p.provider !== "mock";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <dt className="font-medium">{label}</dt>
      <dd className="flex items-center gap-2 text-ink/65">
        <span className={`h-2 w-2 rounded-full ${live ? "bg-lime ring-1 ring-ink/20" : "bg-cyan"}`} aria-hidden />
        {live ? `${NAMES[p.provider] ?? p.provider}, ${p.model}` : "Demo"}
        {p.misconfigured && <span className="text-sm text-blue">Key missing, using demo</span>}
      </dd>
    </div>
  );
}

function Tool({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-5">
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-ink/55">{body}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
