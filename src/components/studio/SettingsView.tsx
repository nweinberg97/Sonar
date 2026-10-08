"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { btn, ErrorNote, Loading, PageHeader, SessionPicker, useSessions } from "./ui";

interface Status {
  auth: boolean;
  transcription: { provider: string; model: string; misconfigured: boolean };
  ai: {
    provider: string;
    model: string;
    misconfigured: boolean;
    ollama?: { reachable: boolean; hasModel: boolean };
    queue?: { lastError: string | null; usingBuiltinUntil: string | null };
  };
  demoTools: boolean;
}

const NAMES: Record<string, string> = { openai: "OpenAI", groq: "Groq", anthropic: "Anthropic", ollama: "Ollama (open source, this machine)" };

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
      // The list of Sonars just changed; reload so every picker is current.
      if (action === "reset" || action === "empty") setTimeout(() => window.location.reload(), 900);
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
            <Provider
              label="Speech to text"
              p={status.transcription}
              text={
                status.transcription.provider === "local"
                  ? `Open-source Whisper on this server (${status.transcription.model.split("/").pop()})`
                  : status.transcription.provider === "mock"
                    ? "Sample transcripts (demo)"
                    : undefined
              }
            />
            <Provider
              label="Insights"
              p={status.ai}
              text={
                status.ai.provider === "mock"
                  ? "Sonar's built-in extractor (rule-based)"
                  : status.ai.provider === "ollama"
                    ? `Open-source ${status.ai.model} via Ollama, on this server`
                    : undefined
              }
            />
            {status.ai.provider === "ollama" && status.ai.ollama && (
              <div className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <dt className="font-medium">Model status</dt>
                  <dd className="flex items-center gap-2 text-ink/65">
                    <span
                      className={`h-2 w-2 rounded-full ${status.ai.ollama.reachable && status.ai.ollama.hasModel ? "bg-lime ring-1 ring-ink/20" : "bg-blue"}`}
                      aria-hidden
                    />
                    {!status.ai.ollama.reachable
                      ? "Ollama isn't running"
                      : !status.ai.ollama.hasModel
                        ? "Model still downloading"
                        : "Ready"}
                  </dd>
                </div>
                {(!status.ai.ollama.reachable || !status.ai.ollama.hasModel || status.ai.queue?.usingBuiltinUntil) && (
                  <p className="mt-2 text-sm leading-relaxed text-ink/55">
                    Until the model is ready, answers are still saved and analyzed with the built-in extractor, so nothing is
                    lost. {!status.ai.ollama.reachable && "In a Codespace, Ollama starts with Sonar. On your own computer, install it from ollama.com and run "}
                    {!status.ai.ollama.reachable && <code className="rounded bg-cloud px-1.5 py-0.5">ollama pull {status.ai.model}</code>}
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
              <dt className="font-medium">Creator sign-in</dt>
              <dd className="text-ink/65">{status.auth ? "Password protected" : "Open. Set SONAR_PASSWORD before sharing."}</dd>
            </div>
          </dl>
          {status.transcription.provider === "mock" && (
            <div className="mt-6 rounded-2xl bg-cloud p-5 text-[0.95rem] leading-relaxed text-ink/75">
              <p>
                Sonar is in demo mode: recording works for real, but transcripts come from a sample bank. To transcribe what people
                actually say, set this in <code className="rounded bg-white px-1.5 py-0.5 text-sm">.env</code> and restart:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-sm leading-relaxed text-white/85">
{`TRANSCRIPTION_PROVIDER=local   # open-source Whisper, free, no key`}
              </pre>
            </div>
          )}
          <p className="mt-6 text-sm text-ink/50">
            {status.transcription.provider === "local"
              ? "Audio is transcribed on this server and discarded straight away. It never goes to a third party."
              : "Audio is sent for transcription and then discarded."}{" "}
            Sonar stores transcripts and insights only, with no names or emails.
          </p>
        </section>
      )}

      <Backups />

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
            <Tool title="Start from blank" body="Deletes every Sonar and response. Use this before a real round of testing.">
              <button
                className={btn.ghost}
                disabled={busy !== null}
                onClick={() => run("empty", {}, "Delete every Sonar and every response? This can't be undone.")}
              >
                {busy === "empty" ? "Deleting…" : "Delete everything"}
              </button>
            </Tool>
            <Tool title="Reset to demo" body="Deletes everything and reloads the Northline Community demo.">
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

function Provider({ label, p, text }: { label: string; p: Status["ai"]; text?: string }) {
  const live = p.provider !== "mock";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <dt className="font-medium">{label}</dt>
      <dd className="flex items-center gap-2 text-ink/65">
        <span className={`h-2 w-2 rounded-full ${live ? "bg-lime ring-1 ring-ink/20" : "bg-cyan"}`} aria-hidden />
        {text ?? `${NAMES[p.provider] ?? p.provider}, ${p.model}`}
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

interface BackupFile {
  name: string;
  bytes: number;
  createdAt: string;
}

function Backups() {
  const [list, setList] = useState<BackupFile[] | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const load = () =>
    api<{ backups: BackupFile[]; undo: string | null }>("/api/backups")
      .then((d) => {
        setList(d.backups);
        setUndo(d.undo);
      })
      .catch(() => setList([]));
  useEffect(() => {
    void load();
  }, []);

  const act = async (key: string, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    setMsg("");
    try {
      const r = await api<{ message: string }>("/api/backups", { method: "POST", json: body });
      setMsg(r.message);
      if (body.action === "create") await load();
      else setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const label = (n: string) =>
    n.includes("before-restore")
      ? "Before a restore"
      : n.includes("before-")
        ? "Before a reset"
        : n.includes("hourly")
          ? "Hourly"
          : "Manual";
  const when = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <section className="mb-14" aria-labelledby="backups">
      <h2 id="backups" className="font-display text-xl font-semibold tracking-tight">
        Backups and undo
      </h2>
      <p className="mt-2 max-w-2xl text-ink/60">
        Sonar copies its whole database automatically: every hour while answers are coming in, and before any reset,
        delete or restore. Restoring always saves what's there first, so it can be undone too.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          className={btn.dark}
          disabled={busy !== null || !undo}
          title={undo ? undefined : "Nothing to undo yet"}
          onClick={() =>
            act("undo", { action: "undo" }, "Put everything back the way it was just before your last reset, delete or restore?")
          }
        >
          {busy === "undo" ? "Undoing…" : "Undo last reset"}
        </button>
        <button className={btn.ghost} disabled={busy !== null} onClick={() => act("create", { action: "create" })}>
          {busy === "create" ? "Backing up…" : "Back up now"}
        </button>
        {msg && (
          <span role="status" className="text-sm text-ink/60">
            {msg}
          </span>
        )}
      </div>
      {list && list.length > 0 && (
        <ul className="mt-6 divide-y divide-ink/8 border-y border-ink/8">
          {list.slice(0, 10).map((b) => (
            <li key={b.name} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[0.95rem]">
              <span>
                {when(b.createdAt)}
                <span className="ml-3 text-sm text-ink/45">
                  {label(b.name)}, {Math.max(1, Math.round(b.bytes / 1024))} KB
                </span>
              </span>
              <span className="flex gap-1">
                <button
                  className={btn.quiet}
                  disabled={busy !== null}
                  onClick={() =>
                    act(b.name, { action: "restore", name: b.name }, `Replace everything with the backup from ${when(b.createdAt)}?`)
                  }
                >
                  {busy === b.name ? "Restoring…" : "Restore"}
                </button>
                <a href={`/api/backups/download?name=${encodeURIComponent(b.name)}`} download={b.name} className={btn.quiet}>
                  Download
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
      {list && list.length === 0 && <p className="mt-5 text-sm text-ink/45">No backups yet. The first one is made within the hour.</p>}
    </section>
  );
}
