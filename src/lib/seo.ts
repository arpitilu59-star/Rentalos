/**
 * Centralised SEO metadata builder.
 *
 * Audit finding: every route was either inheriting the stale root
 * defaults (which still said "RentDesk – AI Rent Manager" and
 * twitter:site "@Lovable") or hand-rolling a partial `meta` array with
 * just a title. No canonical URLs anywhere, no per-page Open Graph, and
 * no robots directives — meaning private dashboards were as indexable
 * as public pages.
 *
 * This builds a complete, consistent meta set from one call so pages
 * don't each reinvent a partial version.
 */

export const SITE_URL = "https://www.rentalos.in";
export const SITE_NAME = "Rentalos";

export type SeoInput = {
  title: string;
  description: string;
  /** Path only, e.g. "/about" — combined with SITE_URL for canonical/OG. */
  path?: string;
  /** Absolute image URL. Falls back to the site icon. */
  image?: string;
  /** Set true for anything behind auth or otherwise not for search. */
  noindex?: boolean;
  /** "website" for pages, "article" for content. */
  type?: "website" | "article";
};

export function seo({ title, description, path, image, noindex, type = "website" }: SeoInput) {
  const url = path ? `${SITE_URL}${path}` : SITE_URL;
  const img = image ?? `${SITE_URL}/icon-512.png`;
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: description },
    // Private pages must be explicitly excluded. robots.txt alone is not
    // a privacy mechanism — these pages are also auth-guarded server-side.
    { name: "robots", content: noindex ? "noindex, nofollow" : "index, follow" },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: url },
    { property: "og:image", content: img },
    { property: "og:site_name", content: SITE_NAME },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: img },
  ];

  return {
    meta,
    links: noindex ? [] : [{ rel: "canonical", href: url }],
  };
}

/**
 * JSON-LD helper. Structured data is only emitted where it genuinely
 * describes visible page content — no fabricated ratings, prices,
 * review counts or availability.
 */
export function jsonLd(data: Record<string, unknown>) {
  return {
    scripts: [{ type: "application/ld+json", children: JSON.stringify(data) }],
  };
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    description:
      "Rentalos helps tenants discover rental rooms and properties, and gives landlords tools to manage rent, tenants, bills and property operations.",
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/myr/browse?city={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}
