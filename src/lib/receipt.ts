import { formatDate } from "@/lib/db";

export function buildReceiptHtml(args: {
  invoiceId: string;
  tenantName: string;
  roomNumber: string;
  amount: number;
  paymentDate: Date;
  businessName: string;
}) {
  const amountFmt = "Rs. " + (args.amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `<!doctype html>
<html><body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#2563eb;padding:24px;color:#fff;">
      <div style="font-size:13px;opacity:.85;letter-spacing:1px;">PAYMENT RECEIPT</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px;">${escape(args.businessName)}</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;">Hi ${escape(args.tenantName)},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">Payment received successfully. Thank you!</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#6b7280;">Invoice ID</td><td style="padding:8px 0;text-align:right;font-weight:600;">${escape(args.invoiceId.slice(0,8).toUpperCase())}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Room</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #e5e7eb;">${escape(args.roomNumber)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Amount</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #e5e7eb;">${amountFmt}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Status</td><td style="padding:8px 0;text-align:right;color:#16a34a;font-weight:700;border-top:1px solid #e5e7eb;">PAID</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Payment Date</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #e5e7eb;">${escape(formatDate(args.paymentDate))}</td></tr>
      </tr>
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Keep this email for your records.</p>
    </div>
    <div style="padding:14px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;">
      ${escape(args.businessName)}
    </div>
  </div>
</body></html>`;
}

function escape(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
