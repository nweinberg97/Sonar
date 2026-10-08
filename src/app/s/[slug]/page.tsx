import type { Metadata } from "next";
import { RespondentFlow } from "@/components/respondent/RespondentFlow";

export const metadata: Metadata = {
  title: "Share your feedback",
  robots: { index: false, follow: false },
};

export default async function RespondPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  return <RespondentFlow slug={slug} preview={preview === "1"} />;
}
