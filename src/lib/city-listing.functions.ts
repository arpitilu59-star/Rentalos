import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public city landing-page data (server-rendered so crawlers see real listings). */
export const getCityPage = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data }) => {
    const { loadCityPage } = await import("./city-listing.server");
    try {
      return { page: await loadCityPage(data.slug) };
    } catch (e) {
      console.error("[city-page] failed:", e instanceof Error ? e.message : e);
      return { page: null };
    }
  });
