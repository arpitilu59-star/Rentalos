// Vercel build config — GitHub → Vercel deploy के लिए
// इस्तेमाल: repo में `vite.config.ts` को rename करके इस file का content उसमें डाल दें
// (या Vercel project settings → Build Command में:  vite build --config vite.config.vercel.ts)
//
// यह Cloudflare Workers की जगह Vercel का nitro preset use करता है।
// ⚠️ Lovable का अपना preview/publish Cloudflare पर चलता है — इसलिए इसे अलग file रखा गया है
// ताकि Lovable में कुछ न टूटे।
import { defineConfig } from '@lovable.dev/vite-tanstack-config';

export default defineConfig({
  tanstackStart: {
    server: { entry: 'server' },
    target: 'vercel',
  },
  vite: {
    // Cloudflare plugin Vercel build में नहीं चाहिए
    plugins: [],
  },
});
