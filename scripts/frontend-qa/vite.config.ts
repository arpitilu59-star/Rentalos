import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const repository = resolve(here, "../..");
const source = resolve(process.env.FRONTEND_QA_BASELINE_ROOT || repository, "src");
export default defineConfig({
  root: here,
  envDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/components/LiveFeedManager", replacement:resolve(here,"mock-panels.tsx") },
      { find: "@/integrations/supabase/client", replacement: resolve(here, "mock-client.ts") },
      {
        find: "@/lib/subscription/use-entitlements",
        replacement: resolve(here, "mock-entitlements.ts"),
      },
      { find: "@/lib/live-feed.functions", replacement: resolve(here, "mock-video.ts") },
      { find: "@/lib/room-insights.functions", replacement: resolve(here, "mock-insights.ts") },
      { find: "@tanstack/react-start", replacement: resolve(here, "mock-server.ts") },
      {
        find: "@/components/subscription/PublicPlans",
        replacement: resolve(here, "mock-panels.tsx"),
      },
      {
        find: "@/components/WhatsAppAutomationPanel",
        replacement: resolve(here, "mock-panels.tsx"),
      },
      { find: "@", replacement: source },
    ],
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
  server: { host: "127.0.0.1", port: 4177, strictPort: true, fs: { allow: [repository, source] } },
});
