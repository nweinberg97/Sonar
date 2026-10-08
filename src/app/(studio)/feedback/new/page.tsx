import type { Metadata } from "next";
import { Suspense } from "react";
import { NewSonar } from "@/components/studio/NewSonar";

export const metadata: Metadata = { title: "New Sonar" };

export default function Page() {
  return (
    <Suspense>
      <NewSonar />
    </Suspense>
  );
}
