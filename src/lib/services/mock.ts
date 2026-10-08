/**
 * Mock providers. Used whenever API keys aren't configured, so the whole
 * product can be demoed and user-tested offline.
 *
 * - mockTranscribe picks a natural, spoken-sounding answer that fits the question.
 * - mockAnalyze runs a small heuristic extractor, so typed answers (the text
 *   fallback) still get believable, honest insight output.
 */
import type { Insight, ThemeCount } from "../types";

// ---------------------------------------------------------------- transcription

type Intent = "positive" | "friction" | "change" | "general";

export function questionIntent(question: string): Intent {
  const q = question.toLowerCase();
  if (/(frustrat|improv|stuck|slow|wrong|annoy|better|worst|didn'?t work|difficult|hard)/.test(q)) return "friction";
  if (/(change|one thing|missing|wish|next time|more useful|should we|would make)/.test(q)) return "change";
  if (/(enjoy|best|went well|like most|useful|love|choose|favou?rite|keep doing|what did you think)/.test(q)) return "positive";
  return "general";
}

const BANK: Record<Intent, string[]> = {
  positive: [
    "Honestly the hands-on part. We actually built something instead of just, um, watching slides, and I left with something I can use on Monday.",
    "The people, for sure. Everyone was really open about what wasn't working, which, yeah, you don't get that in most places.",
    "I liked how fast it moved. Like, there wasn't a lot of fluff, we got straight into it and that kept my attention the whole time.",
    "Getting feedback from like five different people in one go. That would have taken me weeks on my own, so that was huge.",
    "Um, the small group sessions. It felt less like a lecture and more like a conversation, and I asked way more questions than I normally would.",
  ],
  friction: [
    "The scheduling, mostly. It's, um, it's late evening for me so I end up missing the live stuff and then I can't find the recordings.",
    "Honestly finding information. There's like four different places things get posted and I was never sure which one was the right one.",
    "It ran long. The intro part took maybe forty minutes and then we kind of rushed the bit I actually came for.",
    "Signing up was more steps than it needed to be. I had to fill in the same details twice and wait for a confirmation email that took ages.",
    "The setup at the start was confusing. I didn't really know who to talk to or where to go, so I just kind of sat there for the first bit.",
  ],
  change: [
    "Just one place for everything. Even a single page that says here's what's happening this week, go here.",
    "Record the sessions and put them somewhere easy to find. That would honestly fix most of it for me.",
    "Timebox the intro. Five minutes, then straight into the hands-on part.",
    "Pair new people up with someone on day one. Like a buddy, so you're not figuring it all out alone.",
    "More of the interactive stuff and less presenting. Maybe run the popular sessions twice so more people can get in.",
  ],
  general: [
    "Overall it was really good. The content was useful, um, I'd just like it to be a bit easier to find things afterwards.",
    "It was better than I expected. The people were great, the only thing is the timing doesn't always work for me.",
    "I got a lot out of it. If I'm being picky, the start was a little slow, but once it got going it was great.",
  ],
};

export function mockTranscribe(question: string, durationMs: number): string {
  const options = BANK[questionIntent(question)];
  const pick = options[Math.floor(Math.random() * options.length)];
  // Very short recordings get a shorter answer, so the preview feels honest.
  if (durationMs > 0 && durationMs < 2500) {
    const first = pick.split(/(?<=[.!?])\s+/)[0];
    return first;
  }
  return pick;
}

// ---------------------------------------------------------------- insight extraction

interface ThemeDef {
  theme: string;
  words: RegExp;
  action: string;
}

// Ordered most specific first: on a tie, the more specific theme wins.
export const THEME_LEXICON: ThemeDef[] = [
  { theme: "Mentorship", words: /\b(mentor|office hours|advice|coach|expert)\b/, action: "Make mentor time self-serve to book." },
  { theme: "Session recordings", words: /\b(record(ing|ed|s)?|replay|watch (it )?later|video)\b/, action: "Record every session and post it alongside the event it came from." },
  { theme: "Onboarding", words: /\b(onboard|first (day|week)|new (people|member)|sign(ing)? ?up|setup|set up|buddy|getting started|welcome)\b/, action: "Give every newcomer a clear first step and a named person to talk to." },
  { theme: "Pricing", words: /\b(price|pricing|cost|expensive|cheap|pay|paid|subscription|value for money)\b/, action: "Revisit pricing and make the value clearer before people pay." },
  { theme: "Support", words: /\b(support|help desk|response time|reply|replied|ticket|customer service)\b/, action: "Shorten time-to-first-reply on support requests." },
  { theme: "Event scheduling", words: /\b(schedul|time ?zones?|late|evening|morning|timing|calendar|clash|weekend)\b/, action: "Rotate session times or add a second slot so more time zones can attend live." },
  { theme: "Hands-on workshops", words: /\b(hands[- ]on|workshop|exercise|built something|interactive|practical|build)\b/, action: "Make more of the agenda hands-on, and run the most popular sessions twice." },
  { theme: "Finding information", words: /\b(find|places?|channels?|slack|newsletter|posted|where|scattered|noisy|digest|directory)\b/, action: "Publish one canonical page for what's happening and point every channel to it." },
  { theme: "Communication", words: /\b(communicat|email|update|told|informed|announce|heard about)\b/, action: "Announce changes earlier and in one predictable place." },
  { theme: "Pacing", words: /\b(long|rushed|slow|fast|pace|pacing|timebox|intro|dragged|overran|ran over)\b/, action: "Timebox introductions and protect the core working time." },
  { theme: "Ease of use", words: /\b(easy|intuitive|confus|clunky|steps|click|interface|ui|navigation)\b/, action: "Remove steps from the most common flow and fix the confusing parts first." },
  { theme: "Content quality", words: /\b(content|material|slides|talk|speaker|lecture|useful|learned|learnt)\b/, action: "Keep the content practical; trim anything that's lecture without application." },
  { theme: "Peer connections", words: /\b(people|community|connect|network|met|meet|friends?|everyone|room|peers?)\b/, action: "Protect the time people spend with each other; it's what they value most." },
];

const POSITIVE = /\b(love|loved|great|good|best|enjoy(ed)?|useful|helpful|amazing|awesome|fun|easy|liked|valuable|huge|fantastic|excellent|better than|clear|fast|happy|motivat\w*|kept me going)\b/g;
const NEGATIVE = /\b(frustrat\w*|annoy\w*|confus\w*|hard|difficult|slow|missed|missing|never|can'?t|couldn'?t|didn'?t|wasn'?t|bad|worse|worst|pain|broken|noisy|rushed|long|ages|late|wait\w*|problem|issue|lost|stuck|generic|boring)\b/g;
const FRICTION = /(took (forever|ages|too long)|confus|hard to|difficult|wait|slow|manual|spreadsheet|couldn'?t find|can'?t find|missed|missing the|noisy|ran long|rushed|twice|same details|too many|four different|never sure|no way to|takes days|a pain)/i;
const REQUEST_ANYWHERE = /(\bi (really )?wish\b|would love|would (be|help) (great|nice|good|helpful|amazing)?|\bshould\b|could you|can you|\bplease\b|i'?d (love|like)|\bneed(s)? (a|an|more)\b|\bwant (a|an|more)\b)/i;
const REQUEST_START = /^(just |maybe |honestly |so )*(record|timebox|pair|run|put|give|make|add|let|offer|send|move|keep|stop|start|fewer|less|more|one place|a (single|proper|simple))\b/i;
const isRequest = (s: string) => REQUEST_ANYWHERE.test(s) || REQUEST_START.test(s.trim());

const FILLERS = /\b(um+|uh+|erm|like,|you know|i mean|honestly|basically|kind of|sort of|so,? yeah|yeah|actually),?\s*/gi;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\s*,\s*(?=(?:and|but|so)\s)/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);
}

function tidy(s: string, maxWords = 14): string {
  let out = s.replace(/,?\s*\b(um+|uh+|erm)\b,?/gi, "").replace(FILLERS, "").replace(/,(\s*,)+/g, ",").replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").replace(/^[,\s-]+/, "").trim();
  out = out.replace(/[.!?,;:]+$/, "");
  const words = out.split(/\s+/);
  if (words.length > maxWords) {
    let cut = words.slice(0, maxWords);
    while (cut.length > 3 && /^(and|the|then|but|so|to|of|a|an|i|we|it|that|for|with|or|my|our)$/i.test(cut[cut.length - 1].replace(/[,;]$/, ""))) cut = cut.slice(0, -1);
    out = cut.join(" ").replace(/[,;:]$/, "") + "…";
  }
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const REQUEST_LEAD = /^(i (really )?wish (there (was|were) |you (had|would) |it (had|was) |we (had|could) )?|i'?d (love|like) (it if |to see |there to be )?|it would be (great|nice|good|helpful) (if|to have) |would love |you (guys )?should |we should |could you |can you |please |maybe |just |honestly |so |and )+/i;

function asRequest(s: string): string {
  const t = tidy(s, 12).replace(REQUEST_LEAD, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : tidy(s, 12);
}

function lowerFirst(s: string) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export function detectTheme(text: string): string {
  const t = text.toLowerCase();
  let best: { theme: string; hits: number } | null = null;
  for (const def of THEME_LEXICON) {
    const hits = (t.match(new RegExp(def.words.source, "g")) ?? []).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { theme: def.theme, hits };
  }
  return best?.theme ?? "General experience";
}

export function mockAnalyze(transcript: string, question = ""): Insight {
  const text = transcript.trim();
  if (text.split(/\s+/).filter(Boolean).length < 3) {
    return {
      sentiment_score: 5,
      sentiment_label: "neutral",
      primary_theme: "Unclear response",
      business_inefficiency: null,
      feature_requests: [],
      key_points: [],
      executive_summary: "The answer was too short to interpret.",
    };
  }
  const lower = text.toLowerCase();
  const intent = questionIntent(question);
  const pos = (lower.match(POSITIVE) ?? []).length;
  const neg = (lower.match(NEGATIVE) ?? []).length;
  const bias = intent === "positive" ? 1 : intent === "friction" ? -0.5 : 0;
  const score = Math.max(1, Math.min(10, Math.round(6 + 1.1 * (pos - neg) + bias)));
  const label: Insight["sentiment_label"] =
    score >= 7
      ? neg >= 2 ? "mixed" : "positive"
      : score <= 3 || (score <= 4 && pos === 0)
        ? "negative"
        : pos > 0 && neg > 0 ? "mixed" : "neutral";

  const sents = sentences(text);
  const ranked = [...sents].sort((a, b) => b.length - a.length);
  const keyPoints = Array.from(new Set(ranked.slice(0, 3).map((s) => tidy(s)))).filter((s) => s.length > 8);

  const frictionSentence = sents.find((s) => FRICTION.test(s));
  const inefficiency = frictionSentence ? tidy(frictionSentence, 20) + "." : null;

  const requestSentences = sents.filter(isRequest);
  const requests =
    intent === "change" && requestSentences.length === 0 && sents[0] ? [asRequest(sents[0])] : requestSentences.slice(0, 2).map(asRequest);

  const theme = detectTheme(text);
  const lead = keyPoints[0] ? lowerFirst(keyPoints[0].replace(/…$/, "")) : theme.toLowerCase();
  const summary =
    intent === "change" && requests.length
      ? `Suggests a change to ${theme.toLowerCase()}: ${lowerFirst(requests[0].replace(/…$/, ""))}.`
      : label === "positive"
      ? `Values ${theme.toLowerCase()}: ${lead}.`
      : label === "negative"
        ? `Frustrated by ${theme.toLowerCase()}: ${lead}.`
        : label === "mixed"
          ? `Mixed on ${theme.toLowerCase()}: ${lead}.`
        : requests.length
          ? `Suggests a change to ${theme.toLowerCase()}: ${lowerFirst(requests[0].replace(/…$/, ""))}.`
          : `Mixed on ${theme.toLowerCase()}: ${lead}.`;

  return {
    sentiment_score: score,
    sentiment_label: label,
    primary_theme: theme,
    business_inefficiency: inefficiency,
    feature_requests: requests,
    key_points: keyPoints.length >= 2 ? keyPoints : keyPoints.concat(tidy(text, 14)).slice(0, 2),
    executive_summary: summary,
  };
}

// ---------------------------------------------------------------- synthesis

export function mockNarrative(themes: ThemeCount[], requests: { text: string; mentions: number }[], total: number) {
  const loved = themes.filter((t) => t.avgSentiment >= 7 && t.requests * 2 < t.mentions).slice(0, 2).map((t) => t.theme.toLowerCase());
  const hurt = themes.filter((t) => t.avgSentiment < 6 || (t.requests * 2 >= t.mentions && t.avgSentiment < 7)).slice(0, 2);
  const parts: string[] = [];
  if (loved.length) parts.push(`People value ${loved.join(" and ")} most.`);
  if (hurt.length) {
    const mentions = hurt.reduce((n, t) => n + t.mentions, 0);
    parts.push(
      `The main friction is ${hurt.map((t) => t.theme.toLowerCase()).join(" and ")}, raised in ${mentions} of ${total} answers.`,
    );
  }
  if (!parts.length) parts.push(`Feedback so far is balanced across ${themes.length} themes, with no single standout issue.`);

  const actions: string[] = [];
  for (const t of hurt) {
    const def = THEME_LEXICON.find((d) => d.theme === t.theme);
    if (def) actions.push(def.action);
  }
  for (const r of requests.slice(0, 2)) actions.push(`Look at the most-requested change: ${lowerFirst(r.text.replace(/…$/, ""))}.`);
  const top = themes.find((t) => t.avgSentiment >= 7 && t.requests * 2 < t.mentions);
  if (top) {
    const def = THEME_LEXICON.find((d) => d.theme === top.theme);
    if (def) actions.push(def.action);
  }
  return { heard: parts.join(" "), actions: Array.from(new Set(actions)).slice(0, 4) };
}
