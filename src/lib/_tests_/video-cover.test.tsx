// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ id: vi.fn(), url: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("../live-feed.functions", () => ({
  getCoverVideoId: calls.id,
  getVerifiedVideoUrl: calls.url,
}));
import { LiveFeedCover } from "../../components/LiveFeedCover";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  calls.id.mockReset().mockResolvedValue({ id: "video-one" });
  calls.url
    .mockReset()
    .mockResolvedValue({ url: "/full.mp4", previewUrl: "/preview.mp4", posterUrl: "/poster.jpg" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("uses the small preview on cards and keeps the retry player mounted after errors", async () => {
  await act(async () => root.render(<LiveFeedCover target={{ kind: "room", id: "one" }} />));
  expect(container.querySelector("video")?.getAttribute("src")).toBe("/preview.mp4");
  await act(async () => container.querySelector("video")!.dispatchEvent(new Event("error")));
  await act(async () => container.querySelector("video")!.dispatchEvent(new Event("error")));
  expect(container.textContent).toContain("Try again");
  expect(container.textContent).not.toContain("Video coming soon");
});
it("does not show the previous room's video when the next room lookup fails", async () => {
  await act(async () =>
    root.render(<LiveFeedCover target={{ kind: "room", id: "one" }} mode="full" />),
  );
  expect(container.querySelector("video")?.getAttribute("src")).toBe("/full.mp4");
  calls.id.mockRejectedValueOnce(new Error("offline"));
  await act(async () =>
    root.render(<LiveFeedCover target={{ kind: "room", id: "two" }} mode="full" />),
  );
  expect(container.querySelector("video")).toBeNull();
  expect(container.textContent).toContain("Could not load");
});
it("rechecks an initially missing upload on focus instead of caching null forever", async () => {
  calls.id.mockResolvedValueOnce({ id: null });
  await act(async () => root.render(<LiveFeedCover target={{ kind: "room", id: "one" }} />));
  expect(container.querySelector("video")).toBeNull();
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.querySelector("video")?.getAttribute("src")).toBe("/preview.mp4");
});
it("preserves the player and playback position when the same recording is re-signed on focus", async () => {
  await act(async () =>
    root.render(<LiveFeedCover target={{ kind: "room", id: "one" }} mode="full" />),
  );
  const player = container.querySelector("video")!;
  player.currentTime = 8;
  calls.url.mockResolvedValueOnce({
    url: "/full.mp4?new-signature",
    previewUrl: "/preview.mp4?new-signature",
    posterUrl: "/poster.jpg",
  });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(container.querySelector("video")).toBe(player);
  expect(player.currentTime).toBe(8);
  expect(player.getAttribute("src")).toBe("/full.mp4");
});
