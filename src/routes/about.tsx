import { createFileRoute } from "@tanstack/react-router";
import { SiteNavbar } from "@/components/SiteNavbar";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({ meta: [{ title: "About — ManageYourRoom" }] }),
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNavbar />
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">About us</h1>
        {/* TODO — replace with real content. See chat for what's needed. */}
        <p className="mt-6 text-muted-foreground">
          Content pending — see chat: real founding story, problem statement, and any background you
          want visitors to know goes here.
        </p>
      </div>
    </div>
  );
}
