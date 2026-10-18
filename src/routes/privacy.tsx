import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNavbar } from "@/components/SiteNavbar";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () =>
    seo({
      title: "Privacy Policy — Rentalos",
      description: "What data Rentalos collects, why, who can see it, and how you can delete it.",
      path: "/privacy",
    }),
});

const items: [string, string][] = [
  ["What we collect", "Your account details (name, email, mobile number), the rental activity you create (booking requests, bills, payment proofs, maintenance tickets, meter readings), photos or documents you choose to upload (payment screenshots, complaint photos, meter photos, ID documents), your roommate profile if you create one, and a push-notification token for the app. If you tap \"Near me\", your phone's location is used on your device to sort rooms by distance; we do not store it."],
  ["Why we use it", "To run the service: connect tenants with owners, record rent and bills, verify identities, show the right notifications, and keep the platform safe from fraud."],
  ["Who can see it", "Owners see the details of tenants who requested or live in their property (name, mobile, booking terms accepted, bills, tickets, readings). Rentalos admins can see ID documents you upload so they can verify you; these are kept in a private store and are never shown to other tenants. Roommate chat hides phone numbers and emails. We do not sell your data."],
  ["Documents and photos", "ID documents and proofs are stored privately and opened only through short-lived links. Please upload only what is needed."],
  ["Keeping and deleting data", "You can delete your account any time from the app (Profile → Delete my account) or by contacting us. Deleting the account removes your sign-in; some records tied to a tenancy (for example bills an owner issued) may remain with the owner for their accounting."],
  ["Children", "Rentalos is meant for adults who can enter a rental agreement."],
  ["Changes", "If we change this policy we will update this page."],
];

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNavbar />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Rentalos — website and mobile app.</p>
        <div className="mt-8 space-y-6">
          {items.map(([h, b]) => (
            <section key={h}>
              <h2 className="text-lg font-semibold">{h}</h2>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{b}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 text-sm">
          Questions or deletion requests? <Link to="/contact" className="text-primary underline">Contact us</Link>.
        </p>
      </main>
    </div>
  );
}
