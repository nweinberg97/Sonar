import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedbackList } from "@/components/studio/FeedbackList";

export const metadata: Metadata = { title: "Feedback" };

export default function Page() {
  return (
    <Suspense>
      <FeedbackList />
    </Suspense>
  );
}
