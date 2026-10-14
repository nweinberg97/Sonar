import type { Metadata } from "next";
import { RespondentFlow } from "@/components/respondent/RespondentFlow";

export const metadata: Metadata = {
  title: "Share your feedback",
  robots: { index: false, follow: false },
};

/** The page inside the Feedback button's pop-up (see public/embed.js). */
export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ host?: string }>;
}) {
  const { slug } = await params;
  const { host } = await searchParams;
  return <RespondentFlow slug={slug} embed hostOrigin={originOf(host)} />;
}

/** Only a bare origin like https://app.example.com is accepted. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin === value ? value : null;
  } catch {
    return null;
  }
}
