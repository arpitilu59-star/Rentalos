import { getAdmin } from "./whatsapp/db";
import { SUPPORT, SupportQuery, supportEmailText, type SupportQueryInput } from "./support";
import { privateHash, readSmallJson, requestIp, sameSiteRequest } from "./request-safety.server";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function deliverSupportQuery(q: SupportQueryInput): Promise<string> {
  // Fixed recipient and sender: the public form cannot be used as an email relay.
  if (
    process.env.SUPPORT_SMTP_HOST &&
    process.env.SUPPORT_SMTP_USER &&
    process.env.SUPPORT_SMTP_PASSWORD
  ) {
    const { default: nodemailer } = await import("nodemailer");
    const port = Number(process.env.SUPPORT_SMTP_PORT || "465");
    if (![465, 587].includes(port)) throw new Error("Invalid SMTP configuration");
    const transport = nodemailer.createTransport({
      host: process.env.SUPPORT_SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user: process.env.SUPPORT_SMTP_USER, pass: process.env.SUPPORT_SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const result = await transport.sendMail({
      from: { name: "RentalOS Support", address: process.env.SUPPORT_SMTP_USER },
      to: SUPPORT.email,
      replyTo: q.email,
      subject: `[RentalOS · ${q.category}] ${q.subject}`,
      text: supportEmailText(q),
      messageId: `<support-${q.id}@rentalos.in>`,
    });
    if (!result.accepted?.length) throw new Error("Mail service did not accept the query");
    return result.messageId;
  }
  if (process.env.RESEND_API_KEY && process.env.SUPPORT_EMAIL_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `support/${q.id}`,
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        from: process.env.SUPPORT_EMAIL_FROM,
        to: [SUPPORT.email],
        reply_to: q.email,
        subject: `[RentalOS · ${q.category}] ${q.subject}`,
        text: supportEmailText(q),
      }),
    });
    const data = (await response.json()) as { id?: string };
    if (!response.ok || !data.id) throw new Error("Mail service did not accept the query");
    return data.id;
  }
  throw new Error("Email delivery is not configured");
}

export async function handleSupportQuery(request: Request) {
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!sameSiteRequest(request)) return reply({ error: "Please submit from RentalOS." }, 403);
  let q: SupportQueryInput;
  try {
    q = SupportQuery.parse(await readSmallJson(request));
  } catch {
    return reply(
      {
        error:
          "Check the fields. Your query must include a valid email and at least 20 characters.",
      },
      400,
    );
  }
  if (q.website) return reply({ error: "Please try again without autofill." }, 400);
  try {
    const admin = await getAdmin();
    const requester = privateHash("support-email", q.email.toLowerCase());
    const { data: previous, error: readError } = await admin
      .from("support_queries")
      .select("requester_hash,status")
      .eq("id", q.id)
      .maybeSingle();
    if (readError) throw new Error("Storage unavailable");
    if (previous) {
      if (previous.requester_hash !== requester) return reply({ error: "Start a new query." }, 409);
      if (previous.status === "accepted") return reply({ ok: true, reference: q.id });
      // SMTP has no provider idempotency. Never resend a possibly accepted message automatically.
      return reply(
        {
          error: `This query was already recorded. Contact ${SUPPORT.email} with reference ${q.id} if you need an update.`,
          reference: q.id,
        },
        409,
      );
    }
    for (const [scope, key, limit] of [
      ["support-ip", privateHash("support-ip", requestIp(request)), 10],
      ["support-email", requester, 3],
    ] as const) {
      const { data: allowed, error } = await admin.rpc("consume_request_limit", {
        _scope: scope,
        _key: key,
        _limit: limit,
        _seconds: 3600,
      });
      if (error) throw new Error("Rate limit unavailable");
      if (!allowed)
        return reply({ error: "Too many queries. Please wait an hour or call us." }, 429);
    }
    const { error: insertError } = await admin.from("support_queries").insert({
      id: q.id,
      requester_hash: requester,
      name: q.name,
      email: q.email,
      phone: q.phone || null,
      category: q.category,
      subject: q.subject,
      message: q.message,
    });
    if (insertError)
      return reply({ error: "This query could not be recorded. Please try again." }, 409);
    try {
      const providerId = await deliverSupportQuery(q);
      await admin
        .from("support_queries")
        .update({ status: "accepted", provider_id: providerId })
        .eq("id", q.id);
      return reply({ ok: true, reference: q.id });
    } catch {
      await admin.from("support_queries").update({ status: "failed" }).eq("id", q.id);
      return reply(
        {
          error: `Your query was saved, but email delivery could not be confirmed. Please email ${SUPPORT.email} or call ${SUPPORT.displayPhone}.`,
          reference: q.id,
        },
        503,
      );
    }
  } catch {
    return reply({ error: "Support is temporarily unavailable. Please email or call us." }, 503);
  }
}
