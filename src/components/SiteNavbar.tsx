import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Menu, X } from "lucide-react";

const LINKS = [
  { label: "Home", to: "/" },
  { label: "Find a Rental", to: "/myr/browse" },
  { label: "RentDesk", to: "/#rentdesk" },
  { label: "How It Works", to: "/#how-it-works" },
  { label: "Pricing", to: "/pricing" },
  { label: "About", to: "/about" },
] as const;

function NavItem({
  item,
  className,
  onClick,
}: {
  item: (typeof LINKS)[number];
  className: string;
  onClick?: () => void;
}) {
  // Hash links point at sections on the homepage
  if (item.to.startsWith("/#")) {
    return (
      <a href={item.to} className={className} onClick={onClick}>
        {item.label}
      </a>
    );
  }
  return (
    <Link
      to={item.to as "/"}
      className={className}
      onClick={onClick}
      activeOptions={{ exact: item.to === "/" }}
    >
      {item.label}
    </Link>
  );
}

export function SiteNavbar() {
  const nav = useNavigate();
  const [showLandlordWarn, setShowLandlordWarn] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const itemCls =
    "px-3 py-1.5 rounded-md text-sm hover:bg-accent text-muted-foreground [&.active]:text-foreground [&.active]:font-medium focus-visible:outline-none focus-visible:ring-2 ring-ring/60";

  return (
    <>
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="RentalOS home">
            <div className="size-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">
              R
            </div>
            <div className="font-semibold tracking-tight">RentalOS</div>
          </Link>

          <nav className="hidden lg:flex items-center gap-0.5" aria-label="Main">
            {LINKS.map((l) => (
              <NavItem key={l.label} item={l} className={itemCls} />
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2">
            <button
              onClick={() => setShowLandlordWarn(true)}
              className="px-3 py-1.5 text-sm rounded-lg hover:bg-accent text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ring-ring/60"
            >
              Landlord
            </button>
            <button
              onClick={() => nav({ to: "/tenant/login" })}
              className="px-3 py-1.5 text-sm rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 ring-ring/60"
            >
              Login
            </button>
            <button
              onClick={() => nav({ to: "/signup" })}
              className="px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 ring-ring/60"
            >
              Get Started
            </button>
          </div>

          <button
            className="lg:hidden p-2 rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 ring-ring/60"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {open && (
          <nav
            id="mobile-nav"
            aria-label="Mobile"
            className="lg:hidden border-t border-border bg-card px-4 py-3 flex flex-col gap-1"
          >
            {LINKS.map((l) => (
              <NavItem
                key={l.label}
                item={l}
                className={`${itemCls} py-2.5`}
                onClick={() => setOpen(false)}
              />
            ))}
            <button
              onClick={() => {
                setOpen(false);
                setShowLandlordWarn(true);
              }}
              className={`${itemCls} py-2.5 text-left`}
            >
              Landlord sign in
            </button>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Link
                to="/tenant/login"
                onClick={() => setOpen(false)}
                className="text-center px-3 py-2.5 text-sm rounded-lg border border-border"
              >
                Login
              </Link>
              <Link
                to="/signup"
                onClick={() => setOpen(false)}
                className="text-center px-3 py-2.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium"
              >
                Get Started
              </Link>
            </div>
          </nav>
        )}
      </header>

      {showLandlordWarn && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Landlord access"
          className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
        >
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-elevated p-6">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-destructive/15 text-destructive grid place-items-center shrink-0">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <div className="font-semibold">Landlord access only</div>
                <p className="text-sm text-muted-foreground mt-1">
                  This portal is only for verified property owners. Fake property information or
                  misuse may lead to
                  <span className="text-foreground font-medium">
                    {" "}
                    account suspension and applicable legal action
                  </span>{" "}
                  under Indian IT & fraud laws.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowLandlordWarn(false)}
                className="px-3 py-2 text-sm rounded-lg border border-border"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => {
                  setShowLandlordWarn(false);
                  nav({ to: "/landlord/login" });
                }}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium"
              >
                I agree — continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
