import { ValidationError } from "./validate";

export function json(data: unknown, init?: number | ResponseInit): Response {
  const opts = typeof init === "number" ? { status: init } : init;
  return Response.json(data, opts);
}

/** Human error for the client; raw details stay in the server log. */
export function fail(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ValidationError) return fail(err.message, 400);
    console.error("[sonar] request failed:", err);
    return fail("Something went wrong on our side. Please try again.", 500);
  }
}
