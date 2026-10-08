import type { Metadata } from "next";
import { Suspense } from "react";
import { ResponsesView } from "@/components/studio/ResponsesView";

export const metadata: Metadata = { title: "Responses" };

export default function Page() {
  return (
    <Suspense>
      <ResponsesView />
    </Suspense>
  );
}
