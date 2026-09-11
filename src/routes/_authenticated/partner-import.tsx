import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import Papa from "papaparse";
import { AppShell } from "@/components/AppShell";
import { getMyPartnerOrg, bulkImportPartnerListings } from "@/lib/partner.functions";
import { Building2, Upload, Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/partner-import")({
  component: PartnerImportPage,
});

type CsvRow = {
  property_external_ref_id: string;
  property_name: string;
  city?: string;
  address?: string;
  room_external_ref_id: string;
  room_number: string;
  rent_amount: string;
  description?: string;
  amenities?: string;
};

const TEMPLATE = `property_external_ref_id,property_name,city,address,room_external_ref_id,room_number,rent_amount,description,amenities
BLOCK-A,Sunrise Society Block A,Jaipur,"123 MG Road",A-101,101,8500,"2BHK, west facing","wifi;parking;lift"
BLOCK-A,Sunrise Society Block A,Jaipur,"123 MG Road",A-102,102,9000,"3BHK, corner unit","wifi;parking;gym"
`;

function PartnerImportPage() {
  const fetchOrg = useServerFn(getMyPartnerOrg);
  const doImport = useServerFn(bulkImportPartnerListings);

  const [checking, setChecking] = useState(true);
  const [org, setOrg] = useState<{ id: string; name: string; verified: boolean } | null>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    propertiesUpserted: number;
    roomsUpserted: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetchOrg();
      setOrg(res.org);
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = (f: File) => {
    setParseErr(null);
    setResult(null);
    setFileName(f.name);
    Papa.parse<CsvRow>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (res.errors.length > 0) {
          setParseErr(res.errors[0].message);
          return;
        }
        setRows(res.data);
      },
      error: (err) => setParseErr(err.message),
    });
  };

  const runImport = async () => {
    setImporting(true);
    setResult(null);
    try {
      const payload = rows.map((r) => ({
        property_external_ref_id: r.property_external_ref_id,
        property_name: r.property_name,
        city: r.city || undefined,
        address: r.address || undefined,
        room_external_ref_id: r.room_external_ref_id,
        room_number: r.room_number,
        rent_amount: Number(r.rent_amount) || 0,
        description: r.description || undefined,
        amenities: r.amenities
          ? r.amenities
              .split(";")
              .map((a) => a.trim())
              .filter(Boolean)
          : undefined,
      }));
      const res = await doImport({ data: { rows: payload } });
      setResult(res);
      setRows([]);
      setFileName("");
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rentalos-partner-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (checking) {
    return (
      <AppShell>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </AppShell>
    );
  }

  if (!org) {
    return (
      <AppShell>
        <div className="max-w-lg rounded-2xl border border-dashed border-border p-8 text-center">
          <Building2 className="size-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium">Ye account kisi partner organization se linked nahi hai</div>
          <p className="text-sm text-muted-foreground mt-2">
            Agar aap ek society/property manager ki taraf se apna existing inventory MYR marketplace
            par connect karna chahte hain, admin se apna account link karwayein.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="size-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">{org.name} — bulk import</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6 max-w-xl">
        Apna inventory CSV format mein upload karein — properties aur rooms turant MYR par publish
        ho jaayenge. Dobara upload karne par same rows update ho jaayengi (duplicate nahi banegi),
        external ID ke basis par.
      </p>

      <button
        onClick={downloadTemplate}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent mb-4"
      >
        <Download className="size-3.5" /> Sample CSV template download karein
      </button>

      <div className="rounded-2xl bg-card border border-border p-5 max-w-2xl space-y-3">
        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium cursor-pointer w-fit">
          <Upload className="size-4" /> CSV file chunein
          <input
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="hidden"
          />
        </label>
        {fileName && (
          <div className="text-xs text-muted-foreground">
            {fileName} — {rows.length} rows mile
          </div>
        )}
        {parseErr && (
          <div className="text-xs text-destructive flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" /> {parseErr}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto max-h-64 rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2">Property</th>
                    <th className="text-left p-2">Room</th>
                    <th className="text-left p-2">Rent</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-2">{r.property_name}</td>
                      <td className="p-2">{r.room_number}</td>
                      <td className="p-2">₹{r.rent_amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && (
                <div className="text-center text-[10px] text-muted-foreground py-1">
                  +{rows.length - 20} more
                </div>
              )}
            </div>
            <button
              onClick={runImport}
              disabled={importing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
            >
              {importing && <Loader2 className="size-4 animate-spin" />} Import {rows.length} rows
            </button>
          </>
        )}

        {result && (
          <div className="rounded-lg bg-accent/50 p-3 text-sm space-y-1">
            <div className="inline-flex items-center gap-1.5 text-foreground font-medium">
              <CheckCircle2 className="size-4 text-primary" /> {result.propertiesUpserted}{" "}
              properties, {result.roomsUpserted} rooms live
            </div>
            {result.errors.length > 0 && (
              <div className="text-xs text-destructive space-y-0.5 mt-2">
                {result.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
