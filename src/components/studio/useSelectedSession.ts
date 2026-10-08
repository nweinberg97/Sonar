"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useSessions } from "./ui";

/** The Sonar a Responses/Insights page is looking at: ?s=, else the busiest one. */
export function useSelectedSession(basePath: string) {
  const { sessions, error } = useSessions();
  const search = useSearchParams();
  const router = useRouter();
  const requested = search?.get("s") ?? "";

  let selected = sessions?.find((s) => s.id === requested) ?? null;
  if (!selected && sessions?.length) {
    selected = [...sessions].sort((a, b) => b.responseCount - a.responseCount)[0];
  }

  const select = (id: string) => router.replace(`${basePath}?s=${id}`);
  return { sessions, error, selected, select };
}
