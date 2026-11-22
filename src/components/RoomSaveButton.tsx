import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
export function RoomSaveButton({ roomId }: { roomId: string }) {
  const [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void supabase
      .from("app_saved_rooms")
      .select("room_id")
      .eq("room_id", roomId)
      .maybeSingle()
      .then(({ data }) => {
        if (live) setSaved(!!data);
      });
    return () => {
      live = false;
    };
  }, [roomId]);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = `/tenant/login?redirect=${encodeURIComponent(`/myr/room/${roomId}`)}`;
        return;
      }
      const { error } = saved
        ? await supabase
            .from("app_saved_rooms")
            .delete()
            .eq("room_id", roomId)
            .eq("user_id", session.user.id)
        : await supabase
            .from("app_saved_rooms")
            .insert({ room_id: roomId, user_id: session.user.id });
      if (error) throw error;
      setSaved(!saved);
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        disabled={busy}
        aria-pressed={saved}
        onClick={() => void toggle()}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium"
      >
        <Heart className={`size-4 ${saved ? "fill-current text-destructive" : ""}`} />
        {saved ? "Saved" : "Save room"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
