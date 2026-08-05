import jsPDF from "jspdf";
import QRCode from "qrcode";
import { formatDate, upiPayUrl, type Bill, type Profile } from "@/lib/db";

export type BillForPdf = Bill & {
  rooms: { room_number: string } | null;
  tenants: { name: string; phone: string; email?: string | null } | null;
};

const PRIMARY: [number, number, number] = [37, 99, 235];
const MUTED: [number, number, number] = [120, 120, 130];
const BORDER: [number, number, number] = [225, 228, 235];
const ZEBRA: [number, number, number] = [248, 250, 252];

// jsPDF's built-in helvetica does NOT include the ₹ glyph; some PDF viewers
// render the missing glyph as garbled chars (e.g. "&6&5&0&0"). Use "Rs."
// in every PDF amount to stay portable across viewers/printers.
const rs = (n: number) =>
  "Rs. " + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

async function buildQrDataUrl(text: string): Promise<string | null> {
  try { return await QRCode.toDataURL(text, { margin: 1, width: 320, errorCorrectionLevel: "M" }); }
  catch { return null; }
}

export async function generateBillPdf(bill: BillForPdf, profile: Profile | null): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  // Header band
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, W, 92, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text(profile?.business_name || profile?.full_name || "Rent Invoice", M, 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const subParts: string[] = [];
  if (profile?.address) subParts.push(profile.address);
  if (profile?.city) subParts.push(profile.city);
  if (profile?.phone) subParts.push("Ph: " + profile.phone);
  if (subParts.length) doc.text(subParts.join("  -  "), M, 58);
  if (profile?.email) doc.text(profile.email, M, 74);

  doc.setFontSize(9);
  doc.text(`Invoice  #${bill.id.slice(0, 8).toUpperCase()}`, W - M, 40, { align: "right" });
  doc.text(`Issued   ${formatDate(new Date())}`, W - M, 56, { align: "right" });
  doc.text(`Due      ${formatDate(bill.due_date)}`, W - M, 72, { align: "right" });

  doc.setTextColor(20);
  let y = 116;

  // BILLED TO / PERIOD card
  const cardH = 100;
  doc.setDrawColor(...BORDER); doc.setFillColor(...ZEBRA);
  doc.roundedRect(M, y, W - 2 * M, cardH, 8, 8, "FD");
  const colW = (W - 2 * M) / 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text("BILLED TO", M + 14, y + 18);
  doc.text("PERIOD", M + colW + 14, y + 18);

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(20);
  doc.text(bill.tenants?.name ?? "-", M + 14, y + 38);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUTED);
  doc.text(`Room ${bill.rooms?.room_number ?? ""}`, M + 14, y + 54);
  if (bill.tenants?.phone) doc.text(bill.tenants.phone, M + 14, y + 70);
  if (bill.tenants?.email) doc.text(bill.tenants.email, M + 14, y + 84);

  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(20);
  doc.text(`Rent:  ${formatDate(bill.rent_period_start)}  to  ${formatDate(bill.rent_period_end)}`, M + colW + 14, y + 40);
  if (bill.elec_period_start && bill.elec_period_end)
    doc.text(`Elec:  ${formatDate(bill.elec_period_start)}  to  ${formatDate(bill.elec_period_end)}`, M + colW + 14, y + 58);
  doc.setTextColor(...MUTED); doc.setFontSize(9);
  doc.text(`Persons: ${bill.persons}`, M + colW + 14, y + 76);

  y += cardH + 22;

  // ---- ITEMS TABLE ----
  const tableX = M;
  const tableW = W - 2 * M;
  const cDesc = tableX + 14;
  const cDet  = tableX + tableW * 0.55;
  const cAmt  = tableX + tableW - 14;
  const headerH = 26;
  const rowH = 28;

  // header
  doc.setFillColor(...PRIMARY); doc.rect(tableX, y, tableW, headerH, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("DESCRIPTION", cDesc, y + 17);
  doc.text("DETAILS", cDet, y + 17);
  doc.text("AMOUNT", cAmt, y + 17, { align: "right" });
  y += headerH;

  type Row = { label: string; detail: string; amount: number };
  const rows: Row[] = [
    { label: "Rent", detail: `${formatDate(bill.rent_period_start)} - ${formatDate(bill.rent_period_end)}`, amount: Number(bill.rent_amount) },
    { label: "Electricity", detail: `${bill.units_consumed} units  (${bill.prev_reading} to ${bill.curr_reading})`, amount: Number(bill.electricity_amount) },
    { label: "Water", detail: `${bill.persons} person${bill.persons > 1 ? "s" : ""}`, amount: Number(bill.water_amount) },
    { label: "Cleaning", detail: "", amount: Number(bill.cleaning_amount) },
  ];
  if (Number(bill.other_charges) > 0)
    rows.push({ label: bill.other_charges_note || "Other charges", detail: "", amount: Number(bill.other_charges) });
  if (Number(bill.previous_dues) > 0)
    rows.push({ label: "Previous dues", detail: "Carry forward", amount: Number(bill.previous_dues) });

  doc.setTextColor(20);
  rows.forEach((r, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...ZEBRA);
      doc.rect(tableX, y, tableW, rowH, "F");
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20);
    doc.text(r.label, cDesc, y + 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    if (r.detail) doc.text(r.detail, cDet, y + 18);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20);
    doc.text(rs(r.amount), cAmt, y + 18, { align: "right" });
    y += rowH;
    doc.setDrawColor(...BORDER); doc.line(tableX, y, tableX + tableW, y);
  });

  // ---- TOTALS BOX ----
  y += 16;
  const balance = Number(bill.total_amount) - Number(bill.amount_paid);
  const hasPaid = Number(bill.amount_paid) > 0;
  const boxW = 260;
  const boxX = W - M - boxW;
  const boxH = hasPaid ? 82 : 40;
  doc.setFillColor(...ZEBRA); doc.setDrawColor(...BORDER);
  doc.roundedRect(boxX, y, boxW, boxH, 8, 8, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20);
  doc.text("Total payable", boxX + 14, y + 24);
  doc.text(rs(Number(bill.total_amount)), boxX + boxW - 14, y + 24, { align: "right" });
  if (hasPaid) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...MUTED);
    doc.text("Paid so far", boxX + 14, y + 44);
    doc.text(rs(Number(bill.amount_paid)), boxX + boxW - 14, y + 44, { align: "right" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...PRIMARY);
    doc.text("Balance due", boxX + 14, y + 66);
    doc.text(rs(balance), boxX + boxW - 14, y + 66, { align: "right" });
  }
  y += boxH + 26;

  // ---- PAYMENT SECTION ----
  doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Pay via UPI", M, y);
  y += 8;
  doc.setDrawColor(...BORDER); doc.line(M, y, W - M, y);
  y += 16;

  const payAmt = balance > 0 ? balance : Number(bill.total_amount);
  const upi = upiPayUrl(profile?.upi_id, profile?.business_name || profile?.full_name, payAmt, `Rent Room ${bill.rooms?.room_number ?? ""}`);
  const qrData = upi ? await buildQrDataUrl(upi) : null;

  const qrSize = 120;
  if (qrData) {
    doc.addImage(qrData, "PNG", M, y, qrSize, qrSize);
  } else {
    doc.setDrawColor(...BORDER); doc.roundedRect(M, y, qrSize, qrSize, 6, 6, "S");
    doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text("Add UPI ID\nin Profile", M + qrSize / 2, y + qrSize / 2, { align: "center" });
  }

  const infoX = M + qrSize + 18;
  let infoY = y + 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(20);
  if (profile?.upi_id) {
    doc.setFont("helvetica", "bold"); doc.text("UPI ID:", infoX, infoY);
    doc.setFont("helvetica", "normal"); doc.text(profile.upi_id, infoX + 56, infoY);
    infoY += 18;
  }
  doc.setFont("helvetica", "bold"); doc.text("Amount:", infoX, infoY);
  doc.setFont("helvetica", "normal"); doc.text(rs(payAmt), infoX + 56, infoY);
  infoY += 22;
  doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text("Scan with any UPI app (GPay, PhonePe, Paytm, BHIM).", infoX, infoY);
  infoY += 16;

  if (profile?.bank_details) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20);
    doc.text("Bank transfer:", infoX, infoY);
    infoY += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize(profile.bank_details, W - infoX - M);
    doc.text(lines, infoX, infoY);
  }

  // Footer
  doc.setDrawColor(...BORDER); doc.line(M, H - 48, W - M, H - 48);
  doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(`Generated by ${profile?.business_name || "RentDesk"}  -  ${formatDate(new Date())}`, W / 2, H - 30, { align: "center" });

  return doc.output("blob");
}

export async function downloadBillPdf(bill: BillForPdf, profile: Profile | null) {
  const blob = await generateBillPdf(bill, profile);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Bill-Room${bill.rooms?.room_number ?? ""}-${bill.rent_period_start}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
