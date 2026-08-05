import { supabase } from "@/integrations/supabase/client";
import { generateBillPdf, type BillForPdf } from "@/lib/pdf";
import { getOwnerId, type Profile } from "@/lib/db";

/**
 * Generates the bill PDF, uploads it to the private `bill-pdfs` bucket,
 * and returns a short-lived signed URL (1h) that Twilio can fetch as a
 * WhatsApp media attachment. The PDF is no longer publicly listable.
 */
export async function uploadBillPdfPublic(bill: BillForPdf, profile: Profile | null): Promise<string> {
  const owner_id = await getOwnerId();
  const blob = await generateBillPdf(bill, profile);
  const path = `${owner_id}/${bill.id}-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from("bill-pdfs")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error("PDF upload failed: " + error.message);
  const { data, error: signErr } = await supabase.storage
    .from("bill-pdfs")
    .createSignedUrl(path, 60 * 60); // 1 hour — enough for Twilio to fetch
  if (signErr || !data) throw new Error("Signed URL failed: " + (signErr?.message ?? "unknown"));
  return data.signedUrl;
}
