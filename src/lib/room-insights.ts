export type RoomInsight = {
  room_id: string;
  room_number: string;
  views: number;
  saves: number;
  requests: number;
  offers: number;
  bookings: number;
  video_completions: number;
  has_video: boolean;
  has_photos: boolean;
};
export type RoomInsights = {
  rooms: RoomInsight[];
  totals: {
    views: number;
    saves: number;
    requests: number;
    offers: number;
    bookings: number;
    video_completions: number;
  };
  preferences: { summary_frequency: "daily" | "weekly" | "off"; signals_enabled: boolean };
};
export const INSIGHT_METRICS = [
  "views",
  "saves",
  "requests",
  "offers",
  "bookings",
  "video_completions",
] as const;
export function summarizeInsights(rooms: RoomInsight[]) {
  return Object.fromEntries(
    INSIGHT_METRICS.map((k) => [k, rooms.reduce((n, r) => n + Number(r[k] || 0), 0)]),
  ) as RoomInsights["totals"];
}
export function insightTip(r: RoomInsight) {
  if (r.views >= 5) return null;
  if (!r.has_video) return "Add a clear room video to help people explore your space.";
  if (!r.has_photos) return "Add and verify room photos to give visitors more confidence.";
  return "Keep your price, availability and room details up to date.";
}
