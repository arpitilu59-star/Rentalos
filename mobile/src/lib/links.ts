/** Maps a notification's web link to the matching app screen. */
export function routeForLink(link: string | null | undefined): string {
  const l = link ?? "";
  if (/roommate/.test(l)) return "/(tabs)/inbox";
  if (/rent|bill|payment/.test(l)) return "/bills";
  if (/maintenance|ticket/.test(l)) return "/maintenance";
  if (/booking/.test(l)) return "/bookings";
  return "/(tabs)/inbox";
}
