import { supabase } from "@/integrations/supabase/client";

export type Settings = {
  id: string;
  owner_id: string;
  cleaning_amount: number;
  water_per_person: number;
  electricity_per_unit: number;
};

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  business_name: string | null;
  logo_url: string | null;
  upi_id: string | null;
  bank_details: string | null;
  whatsapp_from: string | null;
};

export type Property = {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  city: string | null;
  notes: string | null;
  logo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
};

export type Room = {
  id: string;
  owner_id: string;
  property_id: string;
  room_number: string;
  rent_amount: number;
  water_per_person: number | null;
  cleaning_amount: number | null;
  notes: string | null;
  created_at: string;
};

export type Tenant = {
  id: string;
  owner_id: string;
  room_id: string;
  name: string;
  phone: string;
  email: string | null;
  persons: number;
  move_in_date: string;
  rent_share: number | null;
  active: boolean;
  initial_reading: number | null;
  initial_reading_date: string | null;
  initial_reading_photo: string | null;
};

export type MeterReading = {
  id: string;
  owner_id: string;
  room_id: string;
  reading: number;
  reading_date: string;
  photo_path: string | null;
  ai_detected: boolean;
  created_at: string;
};

export type Bill = {
  id: string;
  owner_id: string;
  room_id: string;
  tenant_id: string | null;
  rent_period_start: string;
  rent_period_end: string;
  rent_amount: number;
  elec_period_start: string | null;
  elec_period_end: string | null;
  prev_reading: number;
  curr_reading: number;
  units_consumed: number;
  electricity_amount: number;
  persons: number;
  water_amount: number;
  cleaning_amount: number;
  other_charges: number;
  other_charges_note: string | null;
  previous_dues: number;
  total_amount: number;
  amount_paid: number;
  due_date: string;
  status: "pending" | "partial" | "paid";
  paid_at: string | null;
  created_at: string;
  reminders_paused_until: string | null;
  last_reminded_at: string | null;
  whatsapp_sent_at: string | null;
  receipt_sent_at: string | null;
};

export type Payment = {
  id: string;
  owner_id: string;
  bill_id: string;
  amount: number;
  paid_on: string;
  method: string | null;
  note: string | null;
  created_at: string;
};

export async function getOwnerId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase.from("settings").select("*").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Settings not found");
  return data as Settings;
}

export async function updateSettings(patch: Partial<Settings>) {
  const s = await getSettings();
  const { error } = await supabase.from("settings").update(patch).eq("id", s.id);
  if (error) throw error;
}

export const formatINR = (n: number) =>
  "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const formatDate = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export const formatDateShort = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/**
 * Anniversary-based billing range.
 * Given move-in date and today, returns:
 *  - rentStart..rentEnd  = next anniversary onwards (advance month)
 *  - elecStart..elecEnd  = previous anniversary period (just completed)
 *
 * Example: move-in 10 May, today 10 June -> rent 10 Jun..10 Jul, elec 10 May..10 Jun.
 */
export function anniversaryRange(moveInISO: string, asOf: Date = new Date()) {
  const move = new Date(moveInISO);
  const day = move.getDate();
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  let candidate = new Date(today.getFullYear(), today.getMonth(), day);
  if (candidate.getTime() < today.getTime()) {
    candidate = new Date(today.getFullYear(), today.getMonth() + 1, day);
  }
  const rentStart = candidate;
  const rentEnd = new Date(rentStart.getFullYear(), rentStart.getMonth() + 1, rentStart.getDate());
  const elecEnd = rentStart;
  const elecStart = new Date(rentStart.getFullYear(), rentStart.getMonth() - 1, rentStart.getDate());
  return { rentStart, rentEnd, elecStart, elecEnd };
}

// Kept for backward compat (used as fallback if no move-in date)
export function nextMonthRange(from: Date = new Date()) {
  const y = from.getFullYear();
  const m = from.getMonth() + 1;
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
}
export function prevMonthRange(from: Date = new Date()) {
  const y = from.getFullYear();
  const m = from.getMonth() - 1;
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
}

export function upiPayUrl(upi: string | null | undefined, name: string | null | undefined, amount: number, note: string) {
  if (!upi) return null;
  const params = new URLSearchParams({
    pa: upi,
    pn: name || "Landlord",
    am: String(amount),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

// QR via free public API (Google Charts mirror)
export function upiQrUrl(upi: string | null | undefined, name: string | null | undefined, amount: number, note: string) {
  const u = upiPayUrl(upi, name, amount, note);
  if (!u) return null;
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(u)}`;
}
