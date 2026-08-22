import { X, ShieldCheck } from "lucide-react";

/**
 * Small shared full-screen video viewer — same visual language as the
 * existing modal already inside LiveFeedCover.tsx (full HTML5 controls,
 * dark backdrop, close button). Extracted here only so the new
 * owner "Watch" button in LiveFeedManager can reuse it instead of a new
 * one-off modal — LiveFeedCover.tsx itself is left completely untouched.
 */
export function VideoPreviewModal({
  url,
  caption,
  onClose,
}: {
  url: string;
  caption?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 grid place-items-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white p-1">
          <X className="size-5" />
        </button>
        <video src={url} controls autoPlay playsInline className="w-full rounded-xl bg-black" />
        {caption && (
          <div className="mt-2 inline-flex items-center gap-1 text-white/90 text-xs">
            <ShieldCheck className="size-3 text-green-400" /> {caption}
          </div>
        )}
      </div>
    </div>
  );
}
