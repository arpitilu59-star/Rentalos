export type LocResult = { lat: number; lng: number; address: string };

export function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message || "Location permission denied")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error("Reverse geocode failed");
  const data = await res.json();
  return data.display_name as string;
}

export async function getCurrentAddress(): Promise<LocResult> {
  const { lat, lng } = await getCurrentLocation();
  const address = await reverseGeocode(lat, lng).catch(() => `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  return { lat, lng, address };
}
