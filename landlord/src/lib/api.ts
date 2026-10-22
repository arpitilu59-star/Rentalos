import { supabase } from "./supabase";

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? "https://www.rentalos.in").replace(/\/+$/, "");
export const WEB = BASE;

/** Calls the Rentalos server (/api/app/*) with the signed-in user's token. Throws a readable Error. */
export async function api<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/app/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("No internet connection. Please try again.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "Something went wrong.");
  return json as T;
}
