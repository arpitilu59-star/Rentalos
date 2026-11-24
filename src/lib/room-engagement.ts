import { supabase } from "@/integrations/supabase/client";
export async function recordRoomEvent(roomId: string, event: "view" | "video_complete") {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await fetch("/api/rooms/engagement", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ room_id: roomId, event }),
    });
  } catch {
    /* Analytics must never interrupt browsing. */
  }
}
