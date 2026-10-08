import type { Metadata } from "next";
import { Suspense } from "react";
import { InsightsView } from "@/components/studio/InsightsView";

export const metadata: Metadata = { title: "Insights" };

export default function Page() {
  return (
    <Suspense>
      <InsightsView />
    </Suspense>
  );
}
