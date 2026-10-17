import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, X } from "lucide-react";
import { listRoomLivePhotos } from "@/lib/live-photos.functions";

/** Public gallery of verified live photos for a room. Renders nothing when there are none. */
export function LivePhotoStrip({ roomId }: { roomId: string }) {
  const list = useServerFn(listRoomLivePhotos);
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    list({ data: { roomId } })
      .then((r) => !off && setPhotos(r))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [roomId, list]);

  if (photos.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold mb-2 inline-flex items-center gap-1.5">
        <ShieldCheck className="size-4 text-emerald-600" /> Live photos taken at the property
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
        {photos.map((p) => (
          <button
            key={p.id}
            onClick={() => setOpen(p.url)}
            className="relative shrink-0 snap-start w-40 aspect-[4/3] rounded-xl overflow-hidden bg-muted"
          >
            <img src={p.url} alt="Live photo of the room" loading="lazy" className="w-full h-full object-cover" />
            <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-600 text-white text-[9px] px-1.5 py-0.5">Live</span>
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/90 grid place-items-center p-4" onClick={() => setOpen(null)}>
          <button className="absolute top-4 right-4 text-white p-2" aria-label="Close">
            <X className="size-6" />
          </button>
          <img src={open} alt="" className="max-h-[88vh] max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </section>
  );
}
