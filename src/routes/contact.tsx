import { createFileRoute } from "@tanstack/react-router";
import { Mail, Phone, MapPin } from "lucide-react";
import { SiteNavbar } from "@/components/SiteNavbar";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({ meta: [{ title: "Contact — ManageYourRoom" }] }),
});

function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNavbar />
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Contact us</h1>
        <p className="mt-3 text-muted-foreground">
          Questions, feedback, or a landlord issue — reach out any of these ways.
        </p>
        {/* TODO — fill in real values. See chat for what's needed. */}
        <div className="mt-8 space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="size-4 text-primary" />
            <span className="text-muted-foreground">[your support email]</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Phone className="size-4 text-primary" />
            <span className="text-muted-foreground">[your contact/WhatsApp number]</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="size-4 text-primary" />
            <span className="text-muted-foreground">[city — optional]</span>
          </div>
        </div>
      </div>
    </div>
  );
}
