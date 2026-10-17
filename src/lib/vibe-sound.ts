/** Welcome "vibe" tone, synthesised with Web Audio (no audio file to download or host). */
export const VIBE_MUTE_KEY = "rentalos_vibe_muted";
export const VIBE_PLAYED_KEY = "rentalos_vibe_played";

const NOTE = (semisFromA4: number) => 440 * Math.pow(2, semisFromA4 / 12);

/** Lo-fi Fmaj9 → Am7 style progression: warm, calm, "home" feeling. [startSec, freq, durSec] */
export function vibeNotes(): Array<[number, number, number]> {
  // F3 A3 C4 E4 G4 chord arpeggio then a soft resolve up
  const chord = [-16, -12, -9, -5, -2].map(NOTE); // F3 A3 C4 E4 G4
  const resolve = [-14, -10, -7, -3, 0].map(NOTE); // G3 B3 D4 F4(ish) A4 — gentle lift
  const out: Array<[number, number, number]> = [];
  chord.forEach((f, i) => out.push([i * 0.16, f, 2.4]));
  resolve.forEach((f, i) => out.push([1.5 + i * 0.16, f, 2.6]));
  out.push([3.2, NOTE(3), 2.2]); // C5 sparkle
  return out;
}

export const vibeDuration = (): number => Math.max(...vibeNotes().map(([s, , d]) => s + d));

/** Returns a stop function, or null when the browser kept audio locked (no user gesture yet). */
export async function playVibe(): Promise<(() => void) | null> {
  const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as
    | typeof AudioContext
    | undefined;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    if (ctx.state !== "running") await ctx.resume();
  } catch {
    /* still locked */
  }
  if (ctx.state !== "running") {
    void ctx.close().catch(() => {});
    return null;
  }
  const master = ctx.createGain();
  master.gain.value = 0;
  // Soft low-pass + tiny echo for the warm "vibe" feel
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.28;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  delay.connect(fb);
  fb.connect(delay);
  master.connect(lp);
  lp.connect(ctx.destination);
  lp.connect(delay);
  delay.connect(ctx.destination);

  const t0 = ctx.currentTime + 0.05;
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(0.5, t0 + 0.3);
  const total = vibeDuration();
  master.gain.setValueAtTime(0.5, t0 + total - 1.2);
  master.gain.linearRampToValueAtTime(0, t0 + total);

  for (const [start, freq, dur] of vibeNotes()) {
    for (const [type, detune, vol] of [["sine", 0, 0.16], ["triangle", 6, 0.07]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const s = t0 + start;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(vol, s + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0008, s + dur);
      o.connect(g);
      g.connect(master);
      o.start(s);
      o.stop(s + dur + 0.05);
    }
  }
  const closer = window.setTimeout(() => void ctx.close().catch(() => {}), (total + 1.5) * 1000);
  return () => {
    window.clearTimeout(closer);
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
      window.setTimeout(() => void ctx.close().catch(() => {}), 250);
    } catch {
      /* already closed */
    }
  };
}
