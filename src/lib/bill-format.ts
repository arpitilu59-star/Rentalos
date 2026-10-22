// Pure helpers shared by the web app and the server (no browser/Supabase imports).
export const formatDate = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

export function upiPayUrl(
  upi: string | null | undefined,
  name: string | null | undefined,
  amount: number,
  note: string,
) {
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

export const inrText = (n: number) =>
  "Rs. " + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
