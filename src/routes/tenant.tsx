import { createFileRoute, Outlet } from "@tanstack/react-router";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/tenant")({
  component: () => <Outlet />,
  // Private area — never indexable. Auth is still enforced server-side;
  // this is the crawler-facing half of that, not the security half.
  head: () => seo({ title: "Tenant portal", description: "", noindex: true }),
});
