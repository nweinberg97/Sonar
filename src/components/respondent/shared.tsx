"use client";

import type { RecorderError } from "../useRecorder";

export const MIC_ERRORS: Record<RecorderError, { title: string; body: string }> = {
  denied: {
    title: "We couldn't access your microphone.",
    body: "Allow microphone access for this site (look for the mic or lock icon next to the address bar), then try again.",
  },
  "no-mic": {
    title: "We couldn't find a microphone.",
    body: "Plug one in or switch devices, then try again. You can also type your answer.",
  },
  insecure: {
    title: "Voice needs a secure connection.",
    body: "Open this link over https to speak your answer, or type it instead.",
  },
  unsupported: {
    title: "This browser can't record audio.",
    body: "Try Safari or Chrome, or type your answer instead.",
  },
  failed: {
    title: "We couldn't start recording.",
    body: "Something on this device blocked the microphone. Try again, or type your answer.",
  },
};

export function PreviewBadge({ dark = false }: { dark?: boolean }) {
  return (
    <p className={`mb-4 self-start rounded-full px-3 py-1 text-xs font-medium ${dark ? "bg-white/10 text-white/70" : "bg-ink/[0.06] text-ink/60"}`}>
      Preview. Answers aren&rsquo;t saved.
    </p>
  );
}

export function MicIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
