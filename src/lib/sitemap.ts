export type SitemapEntry = {
  path: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: number;
  lastmod?: string; // ISO date
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Valid sitemap XML (correct namespace, escaped URLs, de-duplicated, capped at 50,000 URLs). */
export function buildSitemapXml(siteUrl: string, entries: SitemapEntry[]): string {
  const base = siteUrl.replace(/\/+$/, "");
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const e of entries) {
    const path = e.path.startsWith("/") ? e.path : `/${e.path}`;
    if (seen.has(path)) continue;
    seen.add(path);
    if (rows.length >= 50000) break;
    const lm = e.lastmod && !Number.isNaN(Date.parse(e.lastmod)) ? new Date(e.lastmod).toISOString().slice(0, 10) : null;
    rows.push(
      `  <url><loc>${esc(base + path)}</loc>` +
        (lm ? `<lastmod>${lm}</lastmod>` : "") +
        (e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : "") +
        (e.priority != null ? `<priority>${e.priority.toFixed(1)}</priority>` : "") +
        `</url>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
}
