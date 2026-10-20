/* eslint-disable @typescript-eslint/no-explicit-any */
/** Tiny in-memory stand-in for the Supabase service client — enough for the landlord API tests. */
export type DB = Record<string, any[]>;

export function makeAdmin(db: DB, opts: { rpc?: Record<string, (args: any) => any> } = {}) {
  let seq = 0;
  const from = (table: string) => {
    const rows = () => (db[table] ??= []);
    const filters: Array<(r: any) => boolean> = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: any = null;
    let head = false;
    let lim = Infinity;
    const run = () => {
      const match = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "insert") {
        const arr = (Array.isArray(payload) ? payload : [payload]).map((x) => ({
          id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
          ...x,
        }));
        rows().push(...arr);
        return { data: arr, count: arr.length, error: null };
      }
      if (op === "update") {
        match.forEach((r) => Object.assign(r, payload));
        return { data: match, count: match.length, error: null };
      }
      if (op === "delete") {
        db[table] = rows().filter((r) => !match.includes(r));
        return { data: match, count: match.length, error: null };
      }
      return { data: head ? null : match.slice(0, lim), count: match.length, error: null };
    };
    const b: any = {
      select() {
        return b;
      },
      insert(p: any) {
        op = "insert";
        payload = p;
        return b;
      },
      update(p: any) {
        op = "update";
        payload = p;
        return b;
      },
      delete() {
        op = "delete";
        return b;
      },
      eq(k: string, v: any) {
        filters.push((r) => r[k] === v);
        return b;
      },
      neq(k: string, v: any) {
        filters.push((r) => r[k] !== v);
        return b;
      },
      in(k: string, v: any[]) {
        filters.push((r) => v.includes(r[k]));
        return b;
      },
      gte(k: string, v: any) {
        filters.push((r) => r[k] >= v);
        return b;
      },
      lte(k: string, v: any) {
        filters.push((r) => r[k] <= v);
        return b;
      },
      is(k: string, v: any) {
        filters.push((r) => (v === null ? r[k] == null : r[k] === v));
        return b;
      },
      or() {
        return b;
      },
      order() {
        return b;
      },
      limit(n: number) {
        lim = n;
        return b;
      },
      maybeSingle: async () => {
        const r = run();
        return { data: r.data?.[0] ?? null, error: null };
      },
      single: async () => {
        const r = run();
        return r.data?.[0]
          ? { data: r.data[0], error: null }
          : { data: null, error: { message: "not found" } };
      },
      then(res: any, rej: any) {
        return Promise.resolve(run()).then(res, rej);
      },
    };
    const origSelect = b.select;
    b.select = (_c?: string, o?: { head?: boolean }) => {
      if (o?.head) head = true;
      return origSelect();
    };
    return b;
  };
  return {
    from,
    rpc: async (name: string, args: any) =>
      opts.rpc?.[name] ? { data: opts.rpc[name](args), error: null } : { data: null, error: null },
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://signed" } }),
        getPublicUrl: () => ({ data: { publicUrl: "https://pub" } }),
        remove: async () => ({}),
      }),
    },
  };
}
