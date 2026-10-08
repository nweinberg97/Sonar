/**
 * The Sonar mark: an S drawn from two arcs, with a signal echo radiating
 * sideways from each bowl. `level` (0–1) pushes the echoes outward so the mark can
 * react to a live microphone.
 */
export function SonarMark({
  size = 28,
  level = 0,
  tone = "light",
  className = "",
  title,
}: {
  size?: number;
  level?: number;
  tone?: "light" | "dark";
  className?: string;
  title?: string;
}) {
  const s = tone === "dark" ? "#FFFFFF" : "#3867FF";
  const echo = tone === "dark" ? "#C8F36B" : "#55D6BE";
  const push = 1 + Math.min(1, Math.max(0, level)) * 0.18;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g style={{ transformOrigin: "16px 10.5px", transform: `scale(${push})`, transition: "transform 90ms linear" }}>
        <path d="M7.77 5.75 A9.5 9.5 0 0 0 7.77 15.25" stroke={echo} strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: "16px 21.5px", transform: `scale(${push})`, transition: "transform 90ms linear" }}>
        <path d="M24.23 16.75 A9.5 9.5 0 0 1 24.23 26.25" stroke={echo} strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <path
        d="M21 8 A5.5 5.5 0 1 0 16 16 A5.5 5.5 0 1 1 11 24"
        stroke={s}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SonarWordmark({ tone = "light", size = 26 }: { tone?: "light" | "dark"; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <SonarMark size={size} tone={tone} />
      <span
        className={`font-display text-[1.2rem] font-semibold tracking-[-0.03em] ${tone === "dark" ? "text-white" : "text-ink"}`}
      >
        sonar
      </span>
    </span>
  );
}
