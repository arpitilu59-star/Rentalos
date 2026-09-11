import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { SiteNavbar } from "@/components/SiteNavbar";
import { Home, Building2, Users2, Plug, ShieldCheck, Compass, IndianRupee } from "lucide-react";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "About — Rentalos" },
      {
        name: "description",
        content:
          "Rentalos is building the infrastructure that makes renting simpler — not another broker.",
      },
    ],
  }),
});

function Section({
  eyebrow,
  title,
  children,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? undefined : { opacity: 0, y: 24 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className={`max-w-3xl mx-auto px-4 py-14 ${className}`}
    >
      {eyebrow && (
        <div className="text-xs font-medium uppercase tracking-wider text-primary mb-3">
          {eyebrow}
        </div>
      )}
      <h2 className="text-2xl md:text-[32px] font-semibold tracking-tight mb-5">{title}</h2>
      <div className="text-[15px] leading-relaxed text-muted-foreground space-y-4">{children}</div>
    </motion.section>
  );
}

function AboutPage() {
  const reduce = useReducedMotion();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNavbar />

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <motion.h1
          initial={reduce ? undefined : { opacity: 0, y: 16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05]"
        >
          Renting shouldn't be <span className="text-primary">complicated.</span>
        </motion.h1>
        <motion.p
          initial={reduce ? undefined : { opacity: 0, y: 16 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-5 text-base md:text-lg text-muted-foreground max-w-xl mx-auto"
        >
          Tenants jump between listings, brokers, calls, and outdated availability. Landlords manage
          rooms manually. Societies already run their own software — but it rarely connects to the
          people actually looking for a room. Rentalos exists to close that gap.
        </motion.p>
      </section>

      {/* Why we started */}
      <Section eyebrow="Why we started" title="A rental market that stopped talking to itself.">
        <p>
          Finding a room today means jumping between listings, brokers, phone calls, and messages —
          often for availability that's already outdated by the time you see it. Landlords,
          meanwhile, are usually managing everything by hand. And larger societies and property
          managers already have their own software — it just doesn't connect them to the people
          looking for the rooms they have.
        </p>
        <p>
          We wanted to build something that closes that gap, instead of adding another layer on top
          of it.
        </p>
      </Section>

      {/* Zero-commission philosophy */}
      <Section
        eyebrow="A different kind of rental platform"
        title="We don't take a cut of your rent."
      >
        <p>
          Rentalos is built around one idea: make renting more transparent, connected, and
          technology-driven — without becoming another broker. A platform shouldn't take a
          percentage of someone's rent just because it helped them find a room.
        </p>
        <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-start gap-3">
          <IndianRupee className="size-5 text-primary shrink-0 mt-0.5" />
          <p className="text-foreground font-medium text-base leading-snug">
            You pay for the software you use — not for the rent you earn.
          </p>
        </div>
      </Section>

      {/* Built for everyone */}
      <section className="max-w-5xl mx-auto px-4 py-14">
        <motion.div
          initial={reduce ? undefined : { opacity: 0, y: 24 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <div className="text-xs font-medium uppercase tracking-wider text-primary mb-3">
            Built for everyone
          </div>
          <h2 className="text-2xl md:text-[32px] font-semibold tracking-tight">
            Three sides, one connected system.
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              icon: Compass,
              title: "Tenants",
              body: "Find a real property. See useful information. Know whether it's actually available. Connect with the owner directly — less confusion, no broker in between.",
            },
            {
              icon: Home,
              title: "Landlords",
              body: "RentDesk gives smaller property owners simple tools to manage properties, rooms, availability, and tenants — without complicated enterprise software.",
            },
            {
              icon: Building2,
              title: "Societies & property managers",
              body: "Already running your own software? Keep using it. Rentalos connects your available inventory to a wider rental marketplace alongside your existing system.",
            },
          ].map((c, i) => (
            <motion.div
              key={c.title}
              initial={reduce ? undefined : { opacity: 0, y: 20 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-2xl bg-card border border-border p-6"
            >
              <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center mb-4">
                <c.icon className="size-5" />
              </div>
              <div className="font-semibold mb-2">{c.title}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Integration concept */}
      <Section
        eyebrow="Works with the software you already use"
        title="Your management system stays yours."
      >
        <p>
          For larger societies and property managers who already have their own software, Rentalos
          doesn't ask them to replace it. Instead, Rentalos works alongside the existing system and
          connects available inventory to a wider rental marketplace.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3 flex-wrap text-sm">
          <div className="rounded-xl border border-border bg-card px-4 py-3 font-medium">
            Your existing software
          </div>
          <Plug className="size-4 text-primary shrink-0" />
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 font-medium text-primary">
            Rentalos
          </div>
          <Plug className="size-4 text-primary shrink-0" />
          <div className="rounded-xl border border-border bg-card px-4 py-3 font-medium">
            The wider rental market
          </div>
        </div>
        <p className="mt-6 text-center text-sm">
          Their software remains their management system. Rentalos becomes their connection to the
          market.
        </p>
      </Section>

      {/* Trust */}
      <Section eyebrow="Built around trust" title="Information you can actually rely on.">
        <p>
          Property information, landlord identity verification, room details, and availability are
          designed to make renting more reliable and transparent — not just another set of listings
          you have to double-check yourself.
        </p>
        <div className="mt-6 grid sm:grid-cols-3 gap-3 text-center">
          {[
            { icon: ShieldCheck, label: "Landlord identity verification" },
            { icon: Home, label: "Accurate room availability" },
            { icon: Users2, label: "Transparent property information" },
          ].map((t) => (
            <div key={t.label} className="rounded-xl border border-border bg-card p-4">
              <t.icon className="size-5 text-primary mx-auto mb-2" />
              <div className="text-xs font-medium text-foreground">{t.label}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Vision */}
      <Section eyebrow="Where we're going" title="One connected rental ecosystem.">
        <p>
          Rentalos is not just about today's rental market. We're building toward an ecosystem where
          property owners, societies, property-management systems, and tenants can work through one
          connected network — without forcing anyone to abandon the tools they already use.
        </p>
        <p>
          A society keeps using its existing software and still reaches new tenants. A landlord
          manages their rooms without complicated enterprise software. A tenant discovers properties
          without depending entirely on brokers. And the technology works in the background, instead
          of becoming another problem to manage.
        </p>
        <p className="text-foreground font-medium">
          Renting shouldn't be complicated just because the systems around it are disconnected.
          We're building Rentalos to change that.
        </p>
      </Section>

      {/* Final CTA — meaningful, not generic */}
      <motion.section
        initial={reduce ? undefined : { opacity: 0, y: 24 }}
        whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="border-t border-border bg-accent/40"
      >
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Rentalos is not trying to become another broker.
          </h2>
          <p className="mt-3 text-muted-foreground">
            It's building the infrastructure that makes renting simpler — for tenants, landlords,
            and the systems already managing properties today.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link
              to="/myr/browse"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              See what's already live
            </Link>
            <Link
              to="/landlord/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-accent"
            >
              List a property
            </Link>
          </div>
        </div>
      </motion.section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Rentalos · RentDesk
      </footer>
    </div>
  );
}
