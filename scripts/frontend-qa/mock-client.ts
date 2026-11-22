// Deliberately contains no client, credentials, HTTP calls or write operations.
const longName = "Sample Garden Residence With A Very Long Property Name";
const rooms = [0, 1, 2].map((n) => ({
  id: `mock-room-${n}`,
  room_number: `Sample-${n + 1}`,
  rent_amount: n === 0 ? 123456789 : 8500,
  occupant_type: "anyone",
  room_size: "single",
  myr_photos: [],
  myr_amenities: [],
  properties: {
    id: "mock-property",
    name: longName,
    city: n === 1 ? "Kota" : "Jaipur",
    myr_city: n === 1 ? "Kota" : "Jaipur",
    property_type: "pg",
    myr_cover_photos: [],
    verification_status: "verified",
  },
}));
const tenants = [
  {
    id: "mock-tenant",
    name: "Sample Tenant With A Very Long Display Name",
    phone: "0000000000",
    room_id: "mock-room-0",
    rooms: { room_number: "Sample-1" },
  },
];
const bills = [
  {
    id: "mock-bill",
    total_amount: 123456789,
    amount_paid: 0,
    status: "pending",
    due_date: "2030-01-01",
    rent_period_start: "2030-01-01",
    tenants: { name: tenants[0].name },
    rooms: { room_number: "Sample-1" },
  },
];
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null } }),
    getUser: async () => ({ data: { user: { user_metadata: { full_name: "Sample owner" } } } }),
    signOut: async () => ({ error: null }),
  },
  storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:null}})})},
  from(table: string) {
    let data: unknown[] =
      table === "rooms" ? rooms : table === "tenants" ? tenants : table === "bills" ? bills : [];
    if(table==="myr_listing_rooms") data=[{id:"sample-room",label:"Room 204",rent:6500,capacity:2,deposit:1000,furnishing:"semi",gender_pref:"any"}];
    if(table==="myr_listing_media") data=[{id:"sample-photo",kind:"image",storage_path:"fixture"}];
    if (new URLSearchParams(window.location.search).has("empty")) data = [];
    const chain = new Proxy(
      {},
      {
        get(_target, key) {
          if(key==="single" && table==="myr_listings")return async()=>({error:null,data:{id:"sample",title:"Garden Residence",city:"Jaipur",state:"Rajasthan",status:"draft"}});
          if (key === "then")
            return Promise.resolve({ data, count: data.length, error: null }).then.bind(
              Promise.resolve({ data, count: data.length, error: null }),
            );
          return () => chain;
        },
      },
    );
    return chain;
  },
};
