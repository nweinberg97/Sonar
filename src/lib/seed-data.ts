/**
 * Demo data for user testing. Pure data — no database access here.
 *
 * "Forth Community Feedback" is the flagship demo: 12 people answered three
 * open questions by voice. Each answer carries the structured insight the
 * extraction model would return, so the Responses and Insights views look the
 * way they will with live providers.
 */
import type { Insight, Synthesis } from "./types";

type SeedAnswer = [
  transcript: string,
  score: number,
  label: Insight["sentiment_label"],
  theme: string,
  inefficiency: string | null,
  requests: string[],
  keyPoints: string[],
  summary: string,
];

export interface SeedRespondent {
  minutesAgo: number;
  completionSec: number | null; // null = did not finish
  answers: SeedAnswer[];
}

export const FORTH = {
  title: "Forth Community Feedback",
  slug: "forth-community",
  description: "Tell us how Forth has really been for you.",
  template: "event",
  questions: [
    "What did you enjoy most about your experience?",
    "What felt frustrating or could be improved?",
    "If you could change one thing, what would it be?",
  ],
};

export const FORTH_RESPONDENTS: SeedRespondent[] = [
  {
    minutesAgo: 38,
    completionSec: 104,
    answers: [
      ["Honestly the Thursday build nights. Like, I came in not knowing anyone and by the second week I had, um, three people I'd actually text about my project. That's rare.", 9, "positive", "Peer connections", null, [], ["Thursday build nights are the standout", "Made genuine connections within two weeks"], "The Thursday build nights quickly turned strangers into people they now rely on."],
      ["The first week was kind of confusing? There's like four different places things get posted, the Slack, the newsletter, the calendar, and I wasn't sure which one was the real one.", 5, "mixed", "Onboarding", "Announcements are spread across Slack, the newsletter and the calendar with no single source of truth.", [], ["First week felt confusing", "Information is split across four channels"], "New members can't tell which of four channels holds the real information."],
      ["Just one place for everything. Even a pinned page that says here's what's happening this week, go here.", 6, "neutral", "Finding information", null, ["A single weekly 'what's happening' page"], ["Wants one canonical place for updates", "A pinned weekly page would be enough"], "Wants a single pinned page listing what's happening each week."],
    ],
  },
  {
    minutesAgo: 95,
    completionSec: 131,
    answers: [
      ["The workshops. The Figma one with Priya was so good because we actually built something during it instead of just watching slides. I left with a real prototype.", 9, "positive", "Hands-on workshops", null, [], ["Hands-on workshops are highly valued", "Left the Figma workshop with a working prototype"], "Hands-on workshops where people build something are the most valued part."],
      ["Time zones. I'm in Lisbon so most of the evening sessions are like one in the morning for me. I've missed basically every live thing.", 4, "negative", "Event scheduling", "Live sessions are scheduled for North American evenings, excluding European members.", [], ["Evening sessions land at 1am in Europe", "Has missed nearly every live event"], "European members are effectively locked out of live sessions by the schedule."],
      ["Record the sessions. Or rotate the times, maybe once a month do one that works for Europe.", 6, "neutral", "Session recordings", null, ["Record live sessions", "Rotate session times monthly to include Europe"], ["Wants recordings of live sessions", "Suggests a monthly Europe-friendly slot"], "Asks for recordings or a rotating Europe-friendly session time."],
    ],
  },
  {
    minutesAgo: 160,
    completionSec: 88,
    answers: [
      ["The people, for sure. Everyone's building something and nobody's weird about sharing what's not working. That honesty is, yeah, that's the thing.", 9, "positive", "Peer connections", null, [], ["Members openly share what isn't working", "Honest culture is the core value"], "The candid, builder-first culture is what makes the community valuable."],
      ["Um, the Slack gets really noisy. Like I'll come back after a day and there's three hundred messages and I just mark all as read.", 5, "mixed", "Finding information", "High Slack volume means members skip messages entirely instead of reading them.", [], ["Slack volume is overwhelming", "Members mark everything as read"], "Slack volume is high enough that members stop reading it."],
      ["Fewer channels. Or a weekly digest of the good stuff so I don't have to scroll.", 7, "positive", "Finding information", null, ["Weekly digest of highlights", "Consolidate Slack channels"], ["Wants fewer channels", "A weekly digest would replace scrolling"], "Wants fewer Slack channels and a weekly digest of highlights."],
    ],
  },
  {
    minutesAgo: 240,
    completionSec: 142,
    answers: [
      ["I really liked the mentor office hours. I booked twenty minutes with someone who'd actually raised a seed round and she just, like, tore apart my deck in the nicest way.", 9, "positive", "Mentorship", null, [], ["Mentor office hours delivered direct, expert feedback", "Fundraising advice was especially useful"], "Mentor office hours gave direct, expert feedback that changed their pitch."],
      ["Booking those office hours was a pain though. You have to DM someone who then checks a spreadsheet and gets back to you a few days later.", 4, "negative", "Mentorship", "Office hours are booked by DM and a manual spreadsheet, adding days of delay.", ["Self-serve booking for office hours"], ["Booking is manual and slow", "Takes days to get a slot"], "Office-hour booking runs through DMs and a spreadsheet, which takes days."],
      ["A proper booking link for mentors. Calendly, whatever. Just let me pick a slot.", 6, "neutral", "Mentorship", null, ["Self-serve booking link for mentor slots"], ["Wants a self-serve booking link"], "Wants to book mentor slots directly from a link."],
    ],
  },
  {
    minutesAgo: 300,
    completionSec: 76,
    answers: [
      ["Build nights. It's the accountability, you say what you're going to do and then next week people ask if you did it.", 8, "positive", "Peer connections", null, [], ["Build nights create accountability", "Weekly check-ins keep people shipping"], "Build nights work because the group holds people accountable week to week."],
      ["Sometimes the demos run long and we lose half the working time. Like the intro part is forty minutes.", 5, "mixed", "Pacing", "Long intro demos eat into build-night working time.", [], ["Demo segment runs about forty minutes", "Cuts into time to actually build"], "Long demo segments are eating into the working time at build nights."],
      ["Timebox the demos. Five minutes each, hard stop.", 7, "neutral", "Pacing", null, ["Timebox demos to five minutes"], ["Wants strict five-minute demos"], "Suggests a hard five-minute limit on each demo."],
    ],
  },
  {
    minutesAgo: 420,
    completionSec: 118,
    answers: [
      ["The workshop on user interviews, um, that changed how I talk to customers. I stopped asking would you use this, which, yeah, I was asking that a lot.", 9, "positive", "Hands-on workshops", null, [], ["User-interview workshop changed their practice", "Stopped asking leading questions"], "The user-interview workshop directly changed how they talk to customers."],
      ["I didn't know about half the stuff until it was over. Like I found out about the pitch practice night the day after.", 4, "negative", "Finding information", "Events aren't surfaced early enough for members to plan around them.", [], ["Missed events due to late discovery", "Learned about pitch night the day after"], "Members are missing events because they hear about them too late."],
      ["A calendar I can subscribe to. Like add to my Google calendar and then it just shows up.", 7, "neutral", "Event scheduling", null, ["Subscribable calendar feed"], ["Wants a subscribable calendar", "Events should appear in their own calendar"], "Wants a calendar feed that puts events straight into their own calendar."],
    ],
  },
  {
    minutesAgo: 610,
    completionSec: 97,
    answers: [
      ["Getting feedback on my landing page from like six different people in one evening. That would have taken me a month otherwise.", 9, "positive", "Peer connections", null, [], ["Got feedback from six people in one evening", "Saves weeks compared with going alone"], "Fast, concentrated peer feedback saved them weeks of work."],
      ["The onboarding call was kind of generic. It was mostly about rules and I left not knowing who I should talk to.", 5, "mixed", "Onboarding", "Onboarding covers rules but doesn't connect new members to relevant people.", [], ["Onboarding call focused on rules", "Didn't learn who to connect with"], "Onboarding explains the rules but doesn't connect new members to anyone."],
      ["Intro every new person to two members who are working on similar things. Like a warm handoff.", 8, "positive", "Onboarding", null, ["Warm intros to two relevant members for each newcomer"], ["Suggests warm intros for new members", "Match on similar projects"], "Suggests pairing every new member with two people working on similar things."],
    ],
  },
  {
    minutesAgo: 780,
    completionSec: 155,
    answers: [
      ["I mean, it's the energy. I work alone all day so having a room of people who get it, it's... yeah, it's kept me going honestly.", 9, "positive", "Peer connections", null, [], ["Combats isolation of solo work", "The room's energy keeps them motivated"], "For a solo founder, the community is what keeps them motivated."],
      ["Workshops fill up in like an hour and then there's no waitlist, so if you're not refreshing Slack at the right time you're out.", 4, "negative", "Hands-on workshops", "Workshop sign-ups fill within an hour with no waitlist.", ["Waitlist for full workshops"], ["Workshops fill within an hour", "No waitlist exists"], "Popular workshops fill in an hour with no waitlist, so many members miss out."],
      ["More workshops, or run the popular ones twice.", 7, "positive", "Hands-on workshops", null, ["Repeat popular workshops"], ["Demand exceeds workshop capacity", "Run popular sessions twice"], "Wants popular workshops run more than once to meet demand."],
    ],
  },
  {
    minutesAgo: 1020,
    completionSec: 83,
    answers: [
      ["The async channel where people post their weekly wins. It's small but it's motivating to see.", 8, "positive", "Peer connections", null, [], ["Weekly wins channel is motivating"], "The weekly wins channel is a small thing that keeps people motivated."],
      ["Hmm. Probably that the recordings, when there are recordings, they're hard to find. They're in some Drive folder nobody links to.", 5, "mixed", "Session recordings", "Session recordings live in an unlinked Drive folder.", [], ["Recordings exist but are hard to find", "Stored in an unlinked Drive folder"], "The few recordings that exist are buried in an unlinked Drive folder."],
      ["Put recordings next to the event they came from. One page per event.", 7, "neutral", "Session recordings", null, ["One page per event with its recording"], ["Recordings should sit with their event"], "Wants each event page to hold its recording."],
    ],
  },
  {
    minutesAgo: 1440,
    completionSec: 121,
    answers: [
      ["Getting to demo at the end of the cohort. Having a deadline made me actually ship the thing.", 9, "positive", "Pacing", null, [], ["Demo deadline drove them to ship"], "The end-of-cohort demo deadline is what got them to ship."],
      ["The middle weeks kind of sag. There's a big kickoff and a big demo day and then weeks three to five nobody shows up.", 5, "mixed", "Pacing", "Attendance drops in the middle of the cohort with no structure to hold it.", [], ["Mid-cohort attendance drops", "Weeks three to five lack structure"], "Attendance sags mid-cohort when there's no milestone to aim for."],
      ["A mini demo in week four. Low stakes, just show progress.", 8, "positive", "Pacing", null, ["Low-stakes mid-cohort demo in week four"], ["Suggests a week-four progress demo"], "Suggests a low-stakes progress demo in week four to keep momentum."],
    ],
  },
  {
    minutesAgo: 1900,
    completionSec: 109,
    answers: [
      ["Uh, the hands-on stuff. Every time it's interactive it's great, every time it's a talk I kind of zone out.", 8, "positive", "Hands-on workshops", null, [], ["Interactive sessions land, talks don't"], "Interactive sessions consistently land better than talks."],
      ["Finding who's who. There's no directory so I don't know who's a designer, who's technical, who I could ask about pricing.", 4, "negative", "Finding information", "No member directory makes it hard to find the right person to ask.", ["Member directory with skills"], ["No way to see members' skills", "Hard to find who to ask"], "Without a directory, members can't find the right person to ask for help."],
      ["A member directory, even just a spreadsheet with what people are good at.", 7, "neutral", "Finding information", null, ["Member directory listing skills"], ["Even a simple spreadsheet would help"], "Wants a simple directory of members and what they're good at."],
    ],
  },
  {
    minutesAgo: 2600,
    completionSec: null,
    answers: [
      ["The Lisbon meetup was the highlight. Finally got to meet people in person after months on Slack.", 9, "positive", "Peer connections", null, [], ["In-person meetup was the highlight", "Meeting online contacts in person mattered"], "Meeting community members in person was the highlight."],
      ["Same as everyone probably, the time zones. I'm always watching things after the fact if there's even a recording.", 4, "negative", "Event scheduling", "Members outside North America rely on recordings that often don't exist.", ["Recordings of every live session"], ["Time zones block live attendance", "Recordings are inconsistent"], "Time zones push non-US members to recordings that often don't exist."],
    ],
  },
];

export const FORTH_SYNTHESIS: Pick<Synthesis, "heard" | "actions"> = {
  heard:
    "People join Forth for the room: build nights, honest peer feedback and hands-on workshops are what they value most, and several credit them with actually shipping. The friction is almost all logistics. Information is scattered across too many channels, live sessions don't work outside North American evenings, and popular workshops and mentor slots are hard to get into.",
  actions: [
    "Publish one pinned weekly page with every event, and point Slack, the newsletter and the calendar to it.",
    "Record every live session and post it on that event's page, then add one Europe-friendly slot each month.",
    "Replace DM-based mentor booking with a self-serve booking link.",
    "Timebox build-night demos to five minutes and add a low-stakes progress demo in week four.",
    "Give each new member warm intros to two people working on similar things.",
  ],
};

export const DRAFT_SONAR = {
  title: "Q4 launch retro",
  slug: "q4-launch-retro",
  description: "Be honest. Answers are anonymous.",
  template: "retro",
  questions: [
    "What went well that we should keep doing?",
    "What slowed us down?",
    "What should we change next time?",
  ],
};
