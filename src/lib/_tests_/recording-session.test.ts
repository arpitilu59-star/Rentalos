import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { recordStream } from "../recording-session";

class Recorder {
  static instances: Recorder[] = [];
  state = "inactive";
  mimeType = "video/webm";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor() {
    Recorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  chunk(text: string) {
    this.ondataavailable?.({ data: new Blob([text]) });
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.chunk("final");
      this.onstop?.();
    });
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  Recorder.instances = [];
  vi.stubGlobal("MediaRecorder", Recorder);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("isolated recording takes", () => {
  it("flushes the final chunk and freezes duration at stop even if saving happens later", async () => {
    const session = recordStream({} as MediaStream, "video/webm");
    Recorder.instances[0].chunk("first-");
    vi.setSystemTime(15000);
    const done = session.stop();
    vi.setSystemTime(90000);
    await vi.runAllTimersAsync();
    const take = await done;
    expect(take.durationMs).toBe(15000);
    expect(await take.blob.text()).toBe("first-final");
    expect(await session.stop()).toBe(take);
  });
  it("never mixes chunks from separate recorder sessions", async () => {
    const one = recordStream({} as MediaStream, "video/webm");
    const two = recordStream({} as MediaStream, "video/webm");
    Recorder.instances[0].chunk("one-");
    Recorder.instances[1].chunk("two-");
    const a = one.stop(),
      b = two.stop();
    await vi.runAllTimersAsync();
    expect(await (await a).blob.text()).toBe("one-final");
    expect(await (await b).blob.text()).toBe("two-final");
  });
  it("cancels cleanly and refuses an interrupted recorder", async () => {
    const session = recordStream({} as MediaStream, "video/webm");
    session.cancel();
    await vi.runAllTimersAsync();
    await expect(session.stop()).rejects.toThrow(/cancelled/);
    const broken = recordStream({} as MediaStream, "video/webm");
    Recorder.instances[1].onerror?.();
    await expect(broken.stop()).rejects.toThrow(/interrupted/);
  });
});
