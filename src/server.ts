import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

// Official Meta WhatsApp Cloud API endpoints. Handled here (raw fetch) because
// the installed TanStack Start has no raw-HTTP route API. Never throws:
// webhook errors answer 200 so Meta doesn't retry-storm; dispatch errors 500.
async function handleWhatsAppRoute(request: Request, path: string): Promise<Response> {
  let authed = false;
  try {
    if (path === "/api/whatsapp/webhook") {
      const { handleWebhookVerify, handleWebhookEvent } = await import("./lib/whatsapp/webhook");
      if (request.method === "GET") return handleWebhookVerify(new URL(request.url));
      if (request.method === "POST") return await handleWebhookEvent(request);
      return new Response("Method not allowed", { status: 405 });
    }
    // /api/whatsapp/dispatch — called by a scheduler with a shared secret.
    const secret = process.env.WHATSAPP_DISPATCH_SECRET;
    if (!secret) return new Response("Dispatch not configured", { status: 500 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
    authed = true;
    const { dispatchPendingNotifications } = await import("./lib/whatsapp/dispatch");
    const summary = await dispatchPendingNotifications();
    return new Response(JSON.stringify(summary), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("[whatsapp] route error:", error);
    if (path === "/api/whatsapp/webhook") return new Response("ok", { status: 200 });
    // Only a caller that already proved the shared secret gets the reason (shown in the Actions log).
    const reason = authed && error instanceof Error ? error.message.slice(0, 300) : "Internal error";
    return new Response(JSON.stringify({ error: reason }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

/** Dynamic sitemap: static pages + every city with live listings + every live room. */
async function handleSitemap(): Promise<Response> {
  try {
    const { buildSitemapXml } = await import("./lib/sitemap");
    const { SITE_URL } = await import("./lib/seo");
    const { loadSitemapData } = await import("./lib/city-listing.server");
    const { KNOWN_CITIES, slugifyCity } = await import("./lib/cities");
    const d = await loadSitemapData();
    const xml = buildSitemapXml(SITE_URL, [
      { path: "/", changefreq: "daily", priority: 1.0 },
      { path: "/myr/browse", changefreq: "daily", priority: 0.9 },
      { path: "/pricing", changefreq: "monthly", priority: 0.6 },
      { path: "/about", changefreq: "monthly", priority: 0.5 },
      { path: "/contact", changefreq: "monthly", priority: 0.5 },
      // Every known city is listed (even with no rooms yet) plus any other city that has live rooms.
      ...[
        ...d.cities.map((c) => c.slug),
        ...KNOWN_CITIES.map((c) => slugifyCity(c)),
      ].map((slug) => ({ path: `/rooms-in/${slug}`, changefreq: "daily" as const, priority: 0.8 })),
      ...d.rooms.map((r) => ({
        path: `/myr/room/${r.id}`,
        changefreq: "weekly" as const,
        priority: 0.6,
        lastmod: r.updatedAt,
      })),
    ]);
    return new Response(xml, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[sitemap] failed:", error);
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "retry-after": "300" } });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const path = new URL(request.url).pathname;
      if (path === "/sitemap.xml" && request.method === "GET") return await handleSitemap();
      if (path.startsWith("/api/app/")) {
        const { handleMobileApi } = await import("./lib/mobile-api.server");
        return await handleMobileApi(request, path);
      }
      if (path === "/api/razorpay/webhook") {
        const { handleRazorpayWebhook } = await import("./lib/razorpay-webhook.server");
        return await handleRazorpayWebhook(request);
      }
      if (path === "/api/whatsapp/webhook" || path === "/api/whatsapp/dispatch") {
        return await handleWhatsAppRoute(request, path);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
