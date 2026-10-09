"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { btn } from "./ui";

export interface ShareHistoryItem {
  id: string;
  kind: "slack" | "linear";
  source: string;
  title: string;
  status: "sent" | "failed";
  externalUrl: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface ShareRequest {
  kind: "slack" | "linear";
  source?: "action" | "request" | "friction";
  text?: string;
}

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`;

/**
 * Review-and-send: shows exactly what will go to Slack or Linear, lets the
 * creator edit it, and only sends when they press Send. One key per opening,
 * so a double press or a retry can never post twice.
 */
export function ShareComposer({
  sessionId,
  request,
  connected,
  onClose,
  onSent,
}: {
  sessionId: string;
  request: ShareRequest;
  connected: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "sending" | "sent" | "error">("loading");
  const [error, setError] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const keyRef = useRef(newKey());
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const name = request.kind === "slack" ? "Slack" : "Linear";

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
    const link = `${window.location.origin}/insights?s=${sessionId}`;
    api<{ draft: { title: string; body: string; source: string } }>(`/api/sessions/${sessionId}/share`, {
      method: "POST",
      json: { action: "draft", kind: request.kind, source: request.source, text: request.text, link },
    })
      .then(({ draft }) => {
        setTitle(draft.title);
        setBody(draft.body);
        setSource(draft.source);
        setState("ready");
      })
      .catch((e: Error) => {
        setError(e.message);
        setState("error");
      });
  }, [sessionId, request]);

  const doSend = async () => {
    setState("sending");
    setError("");
    try {
      const r = await api<{ item: { externalUrl: string | null } }>(`/api/sessions/${sessionId}/share`, {
        method: "POST",
        json: { action: "send", key: keyRef.current, kind: request.kind, source, title, body },
      });
      setUrl(r.item.externalUrl);
      setState("sent");
      onSent();
    } catch (e) {
      setError((e as Error).message);
      setState("ready");
      onSent(); // the failed attempt shows in history too
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-[24px] bg-white p-0 text-ink shadow-[0_30px_80px_-20px_rgba(17,19,21,0.45)] backdrop:bg-ink/40"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              {request.kind === "slack" ? "Send summary to Slack" : "Create a Linear issue"}
            </h2>
            <p className="mt-1 text-sm text-ink/55">
              {state === "sent" ? "Sent." : `Nothing is sent until you press Send. Edit anything you like.`}
            </p>
          </div>
          <button onClick={() => dialogRef.current?.close()} aria-label="Close" className={btn.quiet}>
            Close
          </button>
        </div>

        {state === "loading" && <p className="py-10 text-ink/50">Writing a draft…</p>}

        {(state === "ready" || state === "sending" || state === "error") && body !== "" && (
          <div className="mt-5 space-y-3">
            {request.kind === "linear" && (
              <label className="block">
                <span className="text-sm font-medium text-ink/55">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  className="mt-1.5 w-full rounded-xl border border-ink/10 px-4 py-2.5 text-[1.05rem] outline-none focus:border-blue"
                />
              </label>
            )}
            <label className="block">
              <span className="text-sm font-medium text-ink/55">{request.kind === "slack" ? "Message" : "Description"}</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                maxLength={8000}
                className="mt-1.5 w-full resize-y rounded-xl border border-ink/10 px-4 py-3 font-mono text-[0.85rem] leading-relaxed outline-none focus:border-blue"
              />
            </label>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-cloud px-4 py-3 text-sm text-ink/80">
            {error}
          </p>
        )}

        {state === "sent" && (
          <div className="mt-6 rounded-2xl bg-cloud p-5">
            <p className="font-semibold">{request.kind === "slack" ? "Posted to your Slack channel." : "Issue created in Linear."}</p>
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-blue underline underline-offset-4">
                Open it
              </a>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {!connected && state !== "loading" && (
            <p className="mr-auto text-sm text-ink/55">
              {name} isn&rsquo;t connected yet.{" "}
              <Link href="/settings#integrations" className="text-blue underline underline-offset-4">
                How to connect
              </Link>
            </p>
          )}
          {state !== "sent" && (
            <button
              onClick={() => void doSend()}
              disabled={!connected || state !== "ready" || !body.trim() || (request.kind === "linear" && !title.trim())}
              className={btn.primary}
            >
              {state === "sending" ? "Sending…" : `Send to ${name}`}
            </button>
          )}
          {state === "sent" && (
            <button onClick={() => dialogRef.current?.close()} className={btn.dark}>
              Done
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
