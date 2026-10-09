/**
 * Decides, from the microphone's loudness, when someone is speaking, when to
 * cut a burst of audio to send for transcription, and when they've paused
 * long enough to show a follow-up. Pure logic with no browser APIs, so it can
 * be tested with made-up loudness sequences.
 *
 * Feed it one loudness reading (RMS, 0–1) per audio block.
 */
export interface VadOptions {
  /** Silence that counts as a pause worth a follow-up. */
  pauseMs: number;
  /** Speech needed before the first follow-up. */
  firstSpeechMs: number;
  /** Speech needed after a follow-up before the next one. */
  nextSpeechMs: number;
  /** Cut a burst at a short breath once it's at least this long… */
  burstMinMs: number;
  /** …or at a longer pause once it's at least this long (so the tail reaches the server before the pause fires). */
  burstFlushMinMs: number;
  /** Always cut by this length. */
  burstMaxMs: number;
  breathMs: number;
  flushSilenceMs: number;
}

export const DEFAULT_VAD: VadOptions = {
  pauseMs: 3000,
  firstSpeechMs: 5000,
  nextSpeechMs: 3000,
  burstMinMs: 8000,
  burstFlushMinMs: 2000,
  burstMaxMs: 15000,
  breathMs: 300,
  flushSilenceMs: 700,
};

/** A burst needs at least this much speech to be worth transcribing. */
const MIN_VOICED_MS = 300;

export interface VadStep {
  voiced: boolean;
  /** Send the audio collected since the last cut. */
  cut: boolean;
  /** Throw away the audio collected since the last cut (it was silence). */
  drop: boolean;
  /** Time to show a follow-up. */
  pause: boolean;
}

export class VoiceActivity {
  private floor = -1;
  private silenceMs = 0;
  private burstMs = 0;
  private burstVoicedMs = 0;
  private speechSincePrompt = 0;
  private pauseFired = false;
  private prompts = 0;

  private o: VadOptions;

  constructor(options: VadOptions = DEFAULT_VAD) {
    this.o = options;
  }

  /** Loudness above which a block counts as speech. Adapts to the room. */
  get threshold(): number {
    return Math.max(0.012, this.floor * 2.5);
  }

  feed(rms: number, blockMs: number): VadStep {
    const o = this.o;
    if (this.floor < 0) this.floor = Math.min(rms, 0.02);
    const voiced = rms > this.threshold;
    // Noise floor: drops quickly to quiet readings, creeps up slowly when nobody's talking.
    if (rms < this.floor) this.floor = this.floor * 0.9 + rms * 0.1;
    else if (!voiced) this.floor += (rms - this.floor) * 0.01;

    this.burstMs += blockMs;
    if (voiced) {
      this.burstVoicedMs += blockMs;
      this.speechSincePrompt += blockMs;
      this.silenceMs = 0;
      this.pauseFired = false;
    } else {
      this.silenceMs += blockMs;
    }

    let cut = false;
    let drop = false;
    if (this.burstVoicedMs >= MIN_VOICED_MS) {
      cut =
        this.burstMs >= o.burstMaxMs ||
        (this.silenceMs >= o.breathMs && this.burstMs >= o.burstMinMs) ||
        (this.silenceMs >= o.flushSilenceMs && this.burstMs >= o.burstFlushMinMs);
    } else if (this.burstMs >= o.burstMaxMs || (this.silenceMs >= o.flushSilenceMs && this.burstMs >= o.burstFlushMinMs)) {
      drop = true; // nothing but silence or a cough
    }
    if (cut || drop) {
      this.burstMs = 0;
      this.burstVoicedMs = 0;
    }

    let pause = false;
    if (!this.pauseFired) {
      const needed = this.prompts === 0 ? o.firstSpeechMs : o.nextSpeechMs;
      // Normal case: they've said enough and gone quiet. Also nudge someone
      // who said very little and then stayed silent for twice as long.
      if (
        (this.silenceMs >= o.pauseMs && this.speechSincePrompt >= needed) ||
        (this.silenceMs >= o.pauseMs * 2 && this.speechSincePrompt >= 1000)
      ) {
        pause = true;
        this.pauseFired = true;
        this.prompts += 1;
        this.speechSincePrompt = 0;
      }
    }
    return { voiced, cut, drop, pause };
  }

  /** Is there unsent speech worth sending when recording stops? */
  get hasPendingSpeech(): boolean {
    return this.burstVoicedMs >= MIN_VOICED_MS;
  }
}
