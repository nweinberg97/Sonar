import type { Metadata } from "next";
import { Suspense } from "react";
import { Builder } from "@/components/studio/Builder";

export const metadata: Metadata = { title: "Build" };

export default function Page() {
  return (
    <Suspense>
      <Builder />
    </Suspense>
  );
}
