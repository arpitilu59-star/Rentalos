// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { ResilientVideo } from "../../components/ResilientVideo";
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
const event = async (name: string) =>
  act(async () => {
    container.querySelector("video")!.dispatchEvent(new Event(name));
  });
describe("room video recovery", () => {
  it("remounts for identical refreshed URLs and keeps manual retry visible after a second failure", async () => {
    const fresh = vi.fn().mockResolvedValue("https://example.test/full.mp4?token=same");
    await act(async () =>
      root.render(
        <ResilientVideo
          src="https://example.test/full.mp4?token=same"
          getFreshUrl={fresh}
          controls
        />,
      ),
    );
    const first = container.querySelector("video");
    await event("error");
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector("video")).not.toBe(first);
    await event("error");
    expect(container.textContent).toContain("Try again");
    expect(container.querySelector("video")).not.toBeNull();
    const second = container.querySelector("video");
    await act(async () => container.querySelector("button")!.click());
    expect(fresh).toHaveBeenCalledTimes(2);
    expect(container.querySelector("video")).not.toBe(second);
  });
  it("does not force unknown-duration videos to an enormous seek position", async () => {
    await act(async () => root.render(<ResilientVideo src="/legacy.webm" controls />));
    const video = container.querySelector("video")!;
    Object.defineProperty(video, "duration", { value: Infinity });
    video.currentTime = 0;
    await event("loadedmetadata");
    expect(video.currentTime).toBe(0);
  });
  it("loops the preview natively, pauses offscreen, and does not loop a full video", async () => {
    await act(async () => root.render(<ResilientVideo src="/preview.mp4" loop muted playing />));
    expect(container.querySelector("video")!.loop).toBe(true);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    await act(async () =>
      root.render(<ResilientVideo src="/preview.mp4" loop muted playing={false} />),
    );
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    await act(async () => root.render(<ResilientVideo src="/full.mp4" controls />));
    expect(container.querySelector("video")!.loop).toBe(false);
    expect(container.querySelector("video")!.controls).toBe(true);
  });
  it("discards stale URL refresh results after switching rooms", async () => {
    let resolve!: (value: string) => void;
    const fresh = () =>
      new Promise<string>((r) => {
        resolve = r;
      });
    await act(async () => root.render(<ResilientVideo src="/room-one.mp4" getFreshUrl={fresh} />));
    await event("error");
    await act(async () => root.render(<ResilientVideo src="/room-two.mp4" />));
    await act(async () => resolve("https://example.test/stale.mp4"));
    expect(container.querySelector("video")!.getAttribute("src")).toBe("/room-two.mp4");
  });
});
