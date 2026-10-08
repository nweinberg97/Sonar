/**
 * Database driver.
 *
 * Sonar keeps every query in src/lib/data.ts as plain SQL, run through this
 * tiny driver. Prisma owns the schema (prisma db push) and the connection.
 * Keeping the surface to `all` / `run` / `transaction` makes the data layer
 * easy to read, easy to reset, and easy to point at another SQLite runner.
 */
import { PrismaClient } from "@prisma/client";

export type Param = string | number | null;

export interface Driver {
  all<T = Record<string, unknown>>(sql: string, ...params: Param[]): Promise<T[]>;
  run(sql: string, ...params: Param[]): Promise<number>;
  transaction<T>(fn: (d: Driver) => Promise<T>): Promise<T>;
}

type RawClient = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;

const globalForPrisma = globalThis as unknown as { __sonarPrisma?: PrismaClient };

const prisma: PrismaClient = globalForPrisma.__sonarPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__sonarPrisma = prisma;

// SQLite COUNT/SUM come back as BigInt through Prisma raw queries.
function normalize<T>(rows: unknown): T[] {
  return (rows as Record<string, unknown>[]).map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) out[k] = typeof v === "bigint" ? Number(v) : v;
    return out as T;
  });
}

// Queries are written with SQLite-style `?` placeholders. If DATABASE_URL points
// at Postgres (e.g. Supabase), rewrite them to `$1, $2, …` so the same SQL runs there.
const isPostgres = /^postgres(ql)?:/i.test(process.env.DATABASE_URL ?? "");
function dialect(sql: string): string {
  if (!isPostgres) return sql;
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

function wrap(client: RawClient, root: boolean): Driver {
  const d: Driver = {
    async all<T>(sql: string, ...params: Param[]) {
      return normalize<T>(await client.$queryRawUnsafe(dialect(sql), ...params));
    },
    async run(sql: string, ...params: Param[]) {
      return client.$executeRawUnsafe(dialect(sql), ...params);
    },
    async transaction<T>(fn: (d: Driver) => Promise<T>) {
      if (!root) return fn(d);
      return prisma.$transaction((tx) => fn(wrap(tx, false)), { timeout: 20_000 });
    },
  };
  return d;
}

export const db: Driver = wrap(prisma, true);
