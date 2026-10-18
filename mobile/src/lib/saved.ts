import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

/** Saved (wishlist) room ids for the signed-in user. Stored in app_saved_rooms with own-row RLS. */
export function useSaved() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["saved-ids"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_saved_rooms").select("room_id");
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((r: { room_id: string }) => r.room_id));
    },
  });
  const toggle = useMutation({
    mutationFn: async (roomId: string) => {
      const has = q.data?.has(roomId);
      const { error } = has
        ? await supabase.from("app_saved_rooms").delete().eq("room_id", roomId)
        : await supabase.from("app_saved_rooms").insert({ room_id: roomId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["saved-ids"] }); qc.invalidateQueries({ queryKey: ["saved-rooms"] }); },
  });
  return { ids: q.data ?? new Set<string>(), isSaved: (id: string) => !!q.data?.has(id), toggle: (id: string) => toggle.mutate(id) };
}
