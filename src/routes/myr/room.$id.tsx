import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createBooking } from "@/lib/bookings.functions";
import { getCoverVideoId } from "@/lib/live-feed.functions";
import { reportMismatch, submitRoomReview, listRoomReviews } from "@/lib/trust.functions";
import {
  ArrowLeft,
  MapPin,
  ShieldCheck,
  Loader2,
  BedDouble,
  CheckCircle2,
  Flag,
  Star,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { LiveFeedCover } from "@/components/LiveFeedCover";

export const Route = createFileRoute("/myr/room/$id")({ component: RoomDetail });

type RoomDetailData = {
  id: string;
  room_number: string;
  rent_amount: number;
  myr_amenities: string[] | null;
  myr_description: string | null;
  myr_deposit: number | null;
  myr_photos: unknown;
  properties: {
    id: string;
    name: string;
    myr_city: string | null;
    myr_address: string | null;
    city: string | null;
    address: string | null;
    myr_description: string | null;
    property_type: string | null;
  } | null;
};

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function RoomDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const getVideoMeta = useServerFn(getCoverVideoId);
  const doReport = useServerFn(reportMismatch);
  const doReview = useServerFn(submitRoomReview);
  const doListReviews = useServerFn(listRoomReviews);

  const [r, setR] = useState<RoomDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBook, setShowBook] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("rooms")
        .select(
          "id, room_number, rent_amount, myr_amenities, myr_description, myr_deposit, myr_photos, properties!inner(id, name, myr_city, myr_address, city, address, myr_description, property_type)",
        )
        .eq("id", id)
        .eq("is_public", true)
        .maybeSingle();
      setR(data as unknown as RoomDetailData);
      setLoading(false);

      const meta = await getVideoMeta({ data: { target: { kind: "room", id } } });
      if (meta.id) setVerifiedAt(meta.verifiedAt);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onBook = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      const redirect = `/myr/room/${id}?book=1`;
      window.location.href = `/tenant/login?redirect=${encodeURIComponent(redirect)}`;
      return;
    }
    setShowBook(true);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("book") === "1") setShowBook(true);
  }, []);

  if (loading)
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!r)
    return (
      <div className="min-h-screen grid place-items-center bg-background text-sm">
        Room not available.
      </div>
    );

  const photos = Array.isArray(r.myr_photos) ? (r.myr_photos as string[]) : [];
  const location =
    r.properties?.myr_address ||
    r.properties?.address ||
    r.properties?.myr_city ||
    r.properties?.city;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => nav({ to: "/myr/browse" })}
            className="inline-flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
          <Link to="/tenant" className="text-sm px-3 py-1.5 rounded-md hover:bg-accent">
            Tenant portal
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-4 gap-2 rounded-2xl overflow-hidden">
          <div className="col-span-4 md:col-span-2 row-span-2 rounded-xl overflow-hidden">
            <LiveFeedCover
              target={{ kind: "room", id: r.id }}
              fallback={photos[0] || null}
              alt={r.properties?.name || undefined}
              aspectClass="aspect-[4/5]"
              showPendingState
            />
          </div>
          {photos.slice(1, 5).map((p, i) => (
            <div key={i} className="aspect-square bg-muted hidden md:block">
              <img src={p} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            {r.properties?.property_type && (
              <div className="text-xs uppercase tracking-wide text-primary font-medium">
                {r.properties.property_type}
              </div>
            )}
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {r.properties?.name} · Room {r.room_number}
            </h1>
            {location && (
              <div className="text-sm text-muted-foreground mt-1">
                <MapPin className="size-3.5 inline -mt-0.5" /> {location}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold">{formatINR(Number(r.rent_amount))}</div>
            <div className="text-xs text-muted-foreground">per month</div>
            {r.myr_deposit != null && (
              <div className="text-xs text-muted-foreground mt-1">
                Deposit {formatINR(Number(r.myr_deposit))}
              </div>
            )}
            {verifiedAt ? (
              <>
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent text-xs">
                  <ShieldCheck className="size-3 text-primary" /> Verified — tap photo to watch
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Last verified on {formatDate(verifiedAt)}
                </div>
              </>
            ) : (
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-xs text-muted-foreground">
                Verification pending
              </div>
            )}
          </div>
        </div>

        {/* #9 — money-back guarantee, policy text only */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5 text-xs">
          <Wallet className="size-4 text-primary shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-foreground">First-visit guarantee:</span>{" "}
            <span className="text-muted-foreground">
              Agar ye room actual mein online dikhaye gaye jaisa na ho, hume batayein — first
              booking ka token/booking amount refund kiya jaayega.
            </span>
          </div>
        </div>

        {(r.myr_description || r.properties?.myr_description) && (
          <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
            {r.myr_description || r.properties?.myr_description}
          </p>
        )}

        {r.myr_amenities && r.myr_amenities.length > 0 && (
          <section>
            <h2 className="font-semibold mb-2">Amenities</h2>
            <div className="flex flex-wrap gap-2">
              {r.myr_amenities.map((a) => (
                <span
                  key={a}
                  className="text-xs px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground inline-flex items-center gap-1"
                >
                  <CheckCircle2 className="size-3" /> {a}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* #6 — report mismatch */}
        <div>
          <button
            onClick={() => setShowReport(true)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
          >
            <Flag className="size-3.5" /> Visit karke lagta hai kuch match nahi karta? Report karein
          </button>
        </div>

        {/* #7 — reviews, including "did it match what you saw online" */}
        <ReviewsSection roomId={r.id} doListReviews={doListReviews} doReview={doReview} />

        <div className="sticky bottom-4 max-w-md mx-auto">
          <button
            onClick={onBook}
            className="w-full inline-flex items-center justify-center gap-2 text-sm px-4 py-3 rounded-xl bg-primary text-primary-foreground shadow-elevated font-medium"
          >
            <BedDouble className="size-4" /> Book this room
          </button>
        </div>
      </div>

      {showBook && (
        <BookModal
          roomId={id}
          onClose={() => setShowBook(false)}
          onDone={() => nav({ to: "/tenant" })}
        />
      )}
      {showReport && (
        <ReportModal roomId={id} doReport={doReport} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}

function ReportModal({
  roomId,
  doReport,
  onClose,
}: {
  roomId: string;
  doReport: ReturnType<typeof useServerFn<typeof reportMismatch>>;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await doReport({ data: { room_id: roomId, note } });
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-elevated p-6">
        {done ? (
          <>
            <div className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="size-5 text-primary" /> Report submit ho gaya
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Hamari team is listing ko review karegi. Dhanyawad.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium"
            >
              Close
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="font-semibold">Kya match nahi karta?</div>
            <textarea
              required
              minLength={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Batayein kya alag tha jo aapko site pe dikha tha..."
              className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm"
            />
            {err && <div className="text-xs text-destructive">{err}</div>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm rounded-lg border border-border"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60"
              >
                {busy ? "Sending…" : "Submit report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ReviewsSection({
  roomId,
  doListReviews,
  doReview,
}: {
  roomId: string;
  doListReviews: ReturnType<typeof useServerFn<typeof listRoomReviews>>;
  doReview: ReturnType<typeof useServerFn<typeof submitRoomReview>>;
}) {
  const [reviews, setReviews] = useState<
    {
      id: string;
      rating: number;
      body: string | null;
      matched_expectations: boolean | null;
      created_at: string;
    }[]
  >([]);
  const [matchedPct, setMatchedPct] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [matched, setMatched] = useState<"yes" | "no" | "">("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const res = await doListReviews({ data: { room_id: roomId } });
    setReviews(res.reviews);
    setMatchedPct(res.matchedPct);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matched) return;
    setBusy(true);
    setErr(null);
    try {
      await doReview({
        data: {
          room_id: roomId,
          rating,
          body: body || undefined,
          matched_expectations: matched === "yes",
        },
      });
      setShowForm(false);
      setBody("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">
          Reviews{" "}
          {matchedPct != null && (
            <span className="text-xs font-normal text-muted-foreground">
              · {matchedPct}% tenants say it matched what they saw online
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="text-xs text-primary font-medium hover:underline"
        >
          Write a review
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="rounded-xl border border-border bg-card p-4 mb-3 space-y-3"
        >
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Kya room bilkul waisa tha jaisa online dikha?
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMatched("yes")}
                className={`px-3 py-1.5 rounded-lg text-xs border ${matched === "yes" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
              >
                Haan, bilkul same
              </button>
              <button
                type="button"
                onClick={() => setMatched("no")}
                className={`px-3 py-1.5 rounded-lg text-xs border ${matched === "no" ? "bg-destructive text-destructive-foreground border-destructive" : "border-border"}`}
              >
                Nahi, alag tha
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Rating</div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)}>
                  <Star
                    className={`size-5 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                  />
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Kuch aur batana hai (optional)"
            className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm"
          />
          {err && <div className="text-xs text-destructive">{err}</div>}
          <button
            disabled={busy || !matched}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Submit review"}
          </button>
        </form>
      )}

      {reviews.length === 0 ? (
        <p className="text-xs text-muted-foreground">Abhi koi review nahi hai.</p>
      ) : (
        <div className="space-y-2">
          {reviews.map((rv) => (
            <div key={rv.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`size-3 ${n <= rv.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                    />
                  ))}
                </div>
                {rv.matched_expectations != null && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${rv.matched_expectations ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}
                  >
                    {rv.matched_expectations ? "Matched online listing" : "Did not match"}
                  </span>
                )}
              </div>
              {rv.body && <p className="text-xs text-muted-foreground mt-1">{rv.body}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BookModal({
  roomId,
  onClose,
  onDone,
}: {
  roomId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const create = useServerFn(createBooking);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) setEmail(user.email);
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, mobile")
        .eq("id", user?.id ?? "")
        .maybeSingle();
      if (p?.full_name) setName(p.full_name);
      if (p?.mobile) setMobile(p.mobile);
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await create({
        data: {
          room_id: roomId,
          tenant_name: name,
          tenant_mobile: mobile,
          tenant_email: email || null,
          message,
        },
      });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <form
        onSubmit={submit}
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-elevated p-6 space-y-3"
      >
        <div>
          <div className="font-semibold">Booking request</div>
          <div className="text-xs text-muted-foreground">
            Landlord ko aapki details bhejenge. Approve hone ke baad rent bill generate hoga.
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Full name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Mobile number *</span>
          <input
            required
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="10-digit"
            inputMode="numeric"
            className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Message (optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input"
          />
        </label>
        {err && <div className="text-xs text-destructive">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-lg border border-border"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </form>
    </div>
  );
}
