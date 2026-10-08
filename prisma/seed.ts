import { resetAndSeed } from "../src/lib/data";

resetAndSeed()
  .then(() => {
    console.log("Sonar: demo workspace loaded (Northline Community Feedback + a draft retro).");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Sonar: seeding failed.", err);
    process.exit(1);
  });
