import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";

export function SiteNavbar() {
  const nav = useNavigate();
  const [showLandlordWarn, setShowLandlordWarn] = useState(false);

  const links = [
    { label: "Home", to: "/" as const },
    { label: "About", to: "/about" as const },
    { label: "Contact", to: "/contact" as const },
  ];

  return (
    <>
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">
              M
            </div>
            <div className="font-semibold tracking-tight">ManageYourRoom</div>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="px-3 py-1.5 rounded-md hover:bg-accent text-muted-foreground [&.active]:text-foreground [&.active]:font-medium"
              >
                {l.label}
              </Link>
            ))}
            <button
              onClick={() => setShowLandlordWarn(true)}
              className="px-3 py-1.5 rounded-md hover:bg-accent text-muted-foreground"
            >
              Landlord
            </button>
          </nav>
        </div>
      </header>

      {showLandlordWarn && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
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
