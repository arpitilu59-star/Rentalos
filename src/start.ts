import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";

// CSRF protection for server functions. Scoped to handlerType 'serverFn'
// so normal page/router requests are unaffected — only the mutating RPC
// surface is validated. Defaults are used for the rest (same-origin
// Sec-Fetch-Site, Referer fallback, 403 on failure).
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
