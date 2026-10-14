import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { PracticePhone } from "@/components/landing/PracticePhone";
import { SonarMark, SonarWordmark } from "@/components/SonarMark";

export const metadata: Metadata = {
  title: { absolute: "Sonar · Effortless Feedback" },
  description:
    "Ask one question. People talk for a minute instead of filling in a form, Sonar asks follow-ups when they pause, and you get themes, quotes and next steps.",
};

// The public demo visitors can try. Point it at any published Sonar (a Conversation one shows follow-ups).
const DEMO = process.env.NEXT_PUBLIC_DEMO_SONAR || "northline-community";
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
// Built as a standalone static page (GitHub Pages): no Sonar server behind it, so the
// demo buttons scroll to the practice run and there's no sign-in or Feedback button.
const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
// The Sonar behind this page's own Feedback button (Sonar collecting feedback about Sonar).
const FEEDBACK = process.env.NEXT_PUBLIC_FEEDBACK_SONAR || DEMO;

/**
 * The public landing page: what Sonar is and where it's going, for people
 * who hear about it. The creator workspace lives at /feedback (password).
 */
export default function Landing() {
  return (
    <div className="min-h-dvh bg-white text-ink">
      <Hero />
      <WhyVoice />
      <HowItWorks />
      <WhatYouGet />
      <Roadmap />
      <Principles />
      <Closing />
      <footer className="border-t border-ink/8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-ink/50 sm:px-8">
          <span className="flex items-center gap-2">
            <SonarMark size={20} />
            Sonar. Effortless Feedback.
          </span>
          {!STATIC && (
            <Link href="/feedback" className="hover:text-ink">
              Creator sign-in
            </Link>
          )}
        </div>
      </footer>
      {/* The same Feedback button any site can add (public/embed.js). */}
      {!STATIC && <Script src="/embed.js" data-sonar={FEEDBACK} data-label="Feedback" strategy="afterInteractive" />}
    </div>
  );
}

// ---------------------------------------------------------------- hero

function Hero() {
  return (
    <section className="relative overflow-hidden bg-cloud">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <span className="flex items-center gap-3">
            <SonarWordmark />
            <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-medium text-ink/55">Early prototype</span>
          </span>
          {!STATIC && (
            <Link href="/feedback" className="rounded-full px-4 py-2 text-sm font-medium text-ink/60 transition hover:bg-ink/5 hover:text-ink">
              Sign in
            </Link>
          )}
        </header>

        <div className="grid items-center gap-14 pb-20 pt-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pb-28 lg:pt-14">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-ink/55">
              <span className="h-1.5 w-1.5 rounded-full bg-blue animate-breathe" aria-hidden />
              Effortless Feedback
            </p>
            <h1 className="mt-4 font-display text-[3rem] font-semibold leading-[0.98] tracking-[-0.045em] text-balance sm:text-[4.4rem]">
              Feedback you can just say out loud.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink/65">
              Ask one question. People talk for a minute instead of filling in a form, and Sonar asks a natural follow-up whenever
              they pause. You get what they actually meant: the themes, the quotes and what to do next.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <DemoLink className="inline-flex h-14 items-center gap-3 rounded-full bg-blue px-7 text-[1.05rem] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,103,255,0.7)] transition hover:bg-blue-press active:scale-[0.98]" />
              <a href="#how" className="inline-flex h-14 items-center rounded-full border border-ink/12 px-6 font-semibold text-ink transition hover:border-ink/25 hover:bg-ink/[0.03]">
                How it works
              </a>
            </div>
            <p className="mt-5 text-sm text-ink/50">No sign-up. Your voice is turned into text and never stored.</p>
          </div>
          <div id="try" className="scroll-mt-8">
            <PracticePhone />
          </div>
        </div>
      </div>
    </section>
  );
}

function MicGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- why voice

function WhyVoice() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <h2 className="font-display text-4xl font-semibold leading-[1.05] tracking-[-0.035em] text-balance sm:text-5xl">Forms get the polite version.</h2>
          <p className="mt-5 max-w-[32rem] text-lg leading-relaxed text-ink/65">
            Typing is work, so people keep it short. Talking is easy, so they tell you what happened, what got in the way and what
            they wish was different. Sonar is built to test one idea: saying it out loud is easier than filling in a survey, and
            you learn more from it.
          </p>
        </div>
        <div className="grid gap-3">
          <figure className="rounded-[24px] border border-ink/10 p-6">
            <figcaption className="text-sm font-medium text-ink/45">Typed into a survey</figcaption>
            <blockquote className="mt-3 text-xl text-ink/70">&ldquo;It was good, a bit confusing at the start.&rdquo;</blockquote>
          </figure>
          <figure className="rounded-[24px] bg-cloud p-6">
            <figcaption className="flex items-center gap-2 text-sm font-medium text-ink/55">
              <span className="h-2 w-2 rounded-full bg-blue" />
              Said out loud, about 40 seconds
            </figcaption>
            <blockquote className="mt-3 text-xl leading-relaxed">
              &ldquo;Honestly the workshops are the best part. But the first week I had no idea where anything was. The schedule was
              in three different places and I nearly didn&rsquo;t come back. One page with what&rsquo;s on this week would fix
              it.&rdquo;
            </blockquote>
          </figure>
          <p className="text-sm text-ink/40">Example answers, to show the difference.</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- how it works

const STEPS = [
  {
    title: "Ask one question",
    body: "Write the question and what you want to learn. Sonar uses your goal to choose follow-ups. Respondents never see it.",
  },
  {
    title: "They talk, Sonar listens",
    body: "One tap and they talk. When they pause, a short follow-up appears so they keep going. Any phone or laptop, no app, no account.",
  },
  {
    title: "You get the signal",
    body: "Every answer becomes text, a sentiment and a theme. Insights pulls them together: what you heard, what keeps coming up, and what to do next.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-6 bg-cloud">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <h2 className="font-display text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">How it works</h2>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-[24px] bg-white p-7">
              <span className="tabular font-display text-2xl font-semibold text-ink/35">{i + 1}</span>
              <h3 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em]">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-ink/65">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- what the creator sees

const THEMES = [
  { name: "Hands-on workshops", n: 19, tone: "Loved", bar: "bg-cyan" },
  { name: "Onboarding", n: 14, tone: "Friction", bar: "bg-blue" },
  { name: "Finding information", n: 11, tone: "Friction", bar: "bg-blue" },
  { name: "Pricing", n: 6, tone: "Asked for", bar: "bg-ink/25" },
];

function WhatYouGet() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
        <div>
          <h2 className="font-display text-4xl font-semibold leading-[1.05] tracking-[-0.035em] text-balance sm:text-5xl">
            Read one page, know what to do next.
          </h2>
          <p className="mt-5 max-w-[30rem] text-lg leading-relaxed text-ink/65">
            You don&rsquo;t have to listen to anything. Sonar writes the summary, counts the themes across everyone, and turns
            them into a short to-do list. Every theme comes with what people actually said.
          </p>
        </div>
        <div className="rounded-[28px] border border-ink/10 p-6 shadow-[0_30px_60px_-40px_rgba(17,19,21,0.4)] sm:p-8" aria-label="Example of the Insights page" role="img">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-ink/45">What did we hear?</p>
            <span className="rounded-full bg-cloud px-3 py-1 text-xs font-medium text-ink/50">Example</span>
          </div>
          <p className="mt-3 font-display text-[1.35rem] leading-snug tracking-[-0.015em]">
            People come for the hands-on workshops. The friction is almost all logistics: information is scattered and the first
            week is confusing.
          </p>
          <ul className="mt-7 divide-y divide-ink/8 border-y border-ink/8">
            {THEMES.map((t) => (
              <li key={t.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
                <span className="font-semibold">{t.name}</span>
                <span className="hidden h-2 overflow-hidden rounded-full bg-ink/[0.05] sm:block">
                  <span className={`block h-full rounded-full ${t.bar}`} style={{ width: `${(t.n / 19) * 100}%` }} />
                </span>
                <span className="tabular text-sm text-ink/55">
                  {t.tone} · {t.n}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm font-medium text-ink/45">What should we do?</p>
          <ul className="mt-3 space-y-2">
            {["Put this week's schedule on one page, linked everywhere.", "Pair every new member with someone for their first week."].map((a) => (
              <li key={a} className="flex gap-3 rounded-2xl bg-cloud px-4 py-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-[2px] bg-blue" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- where it's going

const FEATURES: { title: string; body: string; status: "Works today" | "Next" | "Later" }[] = [
  { title: "A weekly pulse", body: "Same link every week. See what's coming up more, less, or for the first time, per team.", status: "Works today" },
  { title: "One name per idea", body: "A shared theme library across every Sonar, so counts add up over time.", status: "Works today" },
  { title: "Slack and Linear", body: "Send a summary to a channel or turn a request into an issue. You review it before it goes.", status: "Works today" },
  { title: "Testimonials, with permission", body: "People can say “you can quote me.” You choose which quotes to use.", status: "Works today" },
  { title: "Inside your product", body: "A Feedback button any site can add with one line, offered right after a moment that matters. Try the one in the corner.", status: "Works today" },
  { title: "Closing the loop", body: "Personal replies to people who ask for one, and your CRM remembering what they told you.", status: "Later" },
];

const STATUS_STYLE = {
  "Works today": "bg-blue/10 text-blue",
  Next: "bg-cyan/20 text-ink",
  Later: "bg-ink/[0.07] text-ink/60",
};

function Roadmap() {
  return (
    <section className="bg-cloud">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <h2 className="max-w-[40rem] font-display text-4xl font-semibold leading-[1.05] tracking-[-0.035em] text-balance sm:text-5xl">
          Built for teams that keep listening.
        </h2>
        <p className="mt-5 max-w-[38rem] text-lg leading-relaxed text-ink/65">
          A one-off survey tells you how things were. Sonar is meant to run all the time, in the places people already are, and
          get better at asking the longer it runs. Here&rsquo;s what exists today and what&rsquo;s coming.
        </p>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex flex-col rounded-[24px] bg-white p-6">
              <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[f.status]}`}>{f.status}</span>
              <h3 className="mt-5 font-display text-xl font-semibold tracking-[-0.015em]">{f.title}</h3>
              <p className="mt-2 leading-relaxed text-ink/65">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- principles

const PRINCIPLES = [
  { title: "Voice is never stored", body: "Audio becomes text on the server and is thrown away. Only the words are kept." },
  { title: "Anonymous by default", body: "No names, emails or accounts for the people answering." },
  { title: "Your own server, open-source models", body: "Transcription and analysis run on open-source models where Sonar runs, not a third-party AI service." },
  { title: "A person approves what leaves", body: "Nothing goes to Slack, Linear or a website until someone reads it and presses send." },
];

function Principles() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <h2 className="font-display text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Built to be trusted</h2>
      <dl className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="border-t border-ink/10 pt-5">
            <dt className="font-display text-xl font-semibold tracking-[-0.015em]">{p.title}</dt>
            <dd className="mt-2 max-w-[30rem] leading-relaxed text-ink/65">{p.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------- closing

function Closing() {
  return (
    <section className="bg-cloud">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-5 py-24 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-ink/55">Sonar is an early prototype, being tested with a small group.</p>
          <h2 className="mt-4 font-display text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">Hear it for yourself.</h2>
          <p className="mt-4 max-w-[30rem] text-lg text-ink/65">
            {STATIC ? "Tap the mic on the phone above and walk through it the way a customer would." : "Answer the demo the way a customer would. It takes about a minute."}
          </p>
          {CONTACT && (
            <p className="mt-6 text-ink/65">
              Questions or want to try it with your team? <span className="select-all font-medium text-ink">{CONTACT}</span>
            </p>
          )}
        </div>
        <DemoLink className="inline-flex h-14 shrink-0 items-center gap-3 rounded-full bg-blue px-7 text-[1.05rem] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(56,103,255,0.7)] transition hover:bg-blue-press active:scale-[0.98]" />
      </div>
    </section>
  );
}

/** "Try the demo": the real demo Sonar, or the practice run when there's no server (static build). */
function DemoLink({ className }: { className: string }) {
  if (STATIC) {
    return (
      <a href="#try" className={className}>
        <MicGlyph />
        Try the practice run
      </a>
    );
  }
  return (
    <Link href={`/s/${DEMO}`} className={className}>
      <MicGlyph />
      Try the 1-minute demo
    </Link>
  );
}
