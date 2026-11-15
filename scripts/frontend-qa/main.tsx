import React from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Route as Home } from "@/routes/index";
import { Route as Browse } from "@/routes/myr/browse";
import { Route as Dashboard } from "@/routes/_authenticated/rentdesk";
import { parseBrowseSearch } from "@/lib/browse-filters";
import "@/styles.css";

const root = createRootRoute({ component: Outlet });
const home = createRoute({
  getParentRoute: () => root,
  path: "/",
  component: Home.options.component,
});
const browse = Browse.update({
  getParentRoute: () => root,
  path: "/myr/browse",
  id: "/myr/browse",
  validateSearch: parseBrowseSearch,
});
const dashboard = createRoute({
  getParentRoute: () => root,
  path: "/rentdesk",
  component: Dashboard.options.component,
});
const fallback = createRoute({
  getParentRoute: () => root,
  path: "$",
  component: () => (
    <main className="p-8">
      Mock destination. <a href="/">Return home</a>
    </main>
  ),
});
const router = createRouter({ routeTree: root.addChildren([home, browse, dashboard, fallback]) });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
