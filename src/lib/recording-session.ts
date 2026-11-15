export type RecordedTake = { blob: Blob; durationMs: number };

/** Each recorder owns its chunks and captures duration when stopped, not when submitted later. */
export function recordStream(stream: MediaStream, mimeType: string) {
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_000_000,
    audioBitsPerSecond: 96_000,
  });
  const chunks: Blob[] = [];
  let stoppedAt: number | null = null;
  let cancelled = false;
  const startedAt = Date.now();
  const done = new Promise<RecordedTake>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (!cancelled && e.data.size) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("Recording interrupted. Please record again."));
    recorder.onstop = () => {
      if (cancelled) return reject(new Error("Recording cancelled."));
      resolve({
        blob: new Blob(chunks, { type: recorder.mimeType || mimeType }),
        durationMs: (stoppedAt ?? Date.now()) - startedAt,
      });
    };
  });
  // An error may arrive before the UI calls stop(). Keep it observed until then.
  void done.catch(() => {});
  recorder.start(500);
  return {
    elapsed: () => ((stoppedAt ?? Date.now()) - startedAt) / 1000,
    stop: () => {
      stoppedAt ??= Date.now();
      if (recorder.state !== "inactive") recorder.stop();
      return done;
    },
    cancel: () => {
      cancelled = true;
      if (recorder.state !== "inactive") recorder.stop();
      chunks.length = 0;
    },
  };
}
