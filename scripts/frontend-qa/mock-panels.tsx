export function PublicPlans() {
  return <p className="p-4 text-muted-foreground">Mock pricing panel — no API connection.</p>;
}
export function WhatsAppAutomationPanel() {
  return (
    <p className="text-sm text-muted-foreground">
      Mock presentation fixture — automation is disconnected.
    </p>
  );
}

export function LiveFeedManager({label}:{label:string}){return <p className="text-sm text-muted-foreground">{label}</p>;}
