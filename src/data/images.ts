/** The renditions the registry publishes, and the shape of their addresses.
 *
 * Dimensions are the ones registry/images.py encodes to; `original` is the
 * publisher's own file, untouched, so it keeps their format (PNG today)
 * and has no fixed size. */

export const RENDITIONS = [
  { key: "normal", note: "488×680" },
  { key: "small", note: "146×204" },
  { key: "large", note: "672×936" },
  { key: "original", note: "PNG, full size" },
] as const;

/** The address with the rendition left as a placeholder, for the three
 * that differ by that word alone. Null when the URLs are not the shape
 * this describes - better to show nothing than to teach a wrong pattern. */
export function imagePattern(urls: Record<string, string> | null | undefined): string | null {
  const normal = urls?.normal;
  if (!normal?.endsWith(".normal.webp")) return null;
  const stem = normal.slice(0, -".normal.webp".length);
  const matches = (["small", "large"] as const).every((key) => urls?.[key] === `${stem}.${key}.webp`);
  return matches ? `${stem}.{rendition}.webp` : null;
}
