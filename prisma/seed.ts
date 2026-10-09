import { db } from "../src/lib/db";
import { resetAndSeed } from "../src/lib/data";

// Loading the demo replaces everything, so it only runs on an empty database
// unless --force is passed (npm run db:reset does that).
async function main() {
  const force = process.argv.includes("--force");
  const [row] = await db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM feedback_sessions`);
  if (!force && Number(row?.n ?? 0) > 0) {
    console.log("Sonar: the database already has Sonars in it, so the demo wasn't loaded (it would replace them). To start over: npm run db:reset");
    return;
  }
  await resetAndSeed();
  console.log("Sonar: demo workspace loaded (Northline Community Feedback + a draft retro).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Sonar: seeding failed.", err);
    process.exit(1);
  });
