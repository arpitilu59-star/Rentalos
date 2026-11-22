// Synthetic, credential-free data for visual QA. Never imported by production.
export const getMyRoomInsights = async () => ({
  rooms: [
    {
      room_id: "sample",
      room_number: "204",
      views: 128,
      saves: 14,
      requests: 6,
      offers: 3,
      bookings: 2,
      video_completions: 36,
      has_video: true,
      has_photos: true,
    },
  ],
  totals: { views: 128, saves: 14, requests: 6, offers: 3, bookings: 2, video_completions: 36 },
  preferences: { summary_frequency: "weekly", signals_enabled: true },
});
export const updateMyInsightPreferences = async () => ({ ok: true });
export const getMyLandlordDashboard = async () => ({
  rooms: 12,
  occupied: 10,
  beds: 28,
  filled: 24,
  vacant: 4,
  due: 34500,
  paid: 192000,
  collected: 192000,
  overdue: 18500,
  pending: { payments: 3, bookings: 2, meters: 0, tickets: 0 },
});
