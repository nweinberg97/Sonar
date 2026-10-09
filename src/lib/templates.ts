import type { SessionFormat } from "./types";

export interface Template {
  id: string;
  label: string;
  hint: string;
  title: string;
  description: string;
  questions: string[];
  format?: SessionFormat;
  goal?: string;
  targetSeconds?: number;
}

export const TEMPLATES: Template[] = [
  {
    id: "conversation",
    label: "Conversation",
    hint: "One open question. Sonar asks follow-ups when people pause",
    title: "Quick conversation",
    description: "Just talk. We'll ask a follow-up if you pause.",
    questions: ["How has your experience been so far?"],
    format: "conversation",
    goal: "What people value most, where they get stuck, and what one change would help them most.",
    targetSeconds: 60,
  },
  {
    id: "event",
    label: "Event feedback",
    hint: "After a workshop, meetup or conference",
    title: "Event feedback",
    description: "Tell us what you really thought.",
    questions: [
      "What was the best part of the event?",
      "Was there anything that frustrated you?",
      "If you could change one thing, what would it be?",
    ],
  },
  {
    id: "product",
    label: "Product feedback",
    hint: "On a feature, release or prototype",
    title: "Product feedback",
    description: "A couple of minutes on what's working and what isn't.",
    questions: [
      "What did you think of the new feature?",
      "Where did you get stuck, if anywhere?",
      "What would make this genuinely more useful to you?",
    ],
  },
  {
    id: "retro",
    label: "Team retrospective",
    hint: "End of a sprint, project or quarter",
    title: "Team retrospective",
    description: "Be honest. Answers are anonymous.",
    questions: [
      "What went well that we should keep doing?",
      "What slowed us down?",
      "What should we change next time?",
    ],
  },
  {
    id: "customer",
    label: "Customer feedback",
    hint: "Check in with people who use what you make",
    title: "Customer feedback",
    description: "We read every response.",
    questions: [
      "What made you choose us in the first place?",
      "What could we have done better?",
      "What are we missing?",
    ],
  },
  {
    id: "general",
    label: "General feedback",
    hint: "Start from a single open question",
    title: "Feedback",
    description: "Tell us what's on your mind.",
    questions: ["Tell us about your experience."],
  },
];

export function getTemplate(id: string | null | undefined): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1];
}
