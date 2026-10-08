// Download the Whisper model into ./.models ahead of time: `npm run whisper:prefetch`.
// After this, you can set TRANSCRIPTION_OFFLINE=true so the server never fetches again.
import { warmUpLocalWhisper } from "../src/lib/services/whisper-local";

warmUpLocalWhisper().then(() => {
  console.log("Sonar: Whisper model is cached in ./.models");
  process.exit(0);
});
