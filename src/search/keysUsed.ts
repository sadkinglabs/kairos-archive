/** The keys a query used, sorted and unique: "e t", "a unique:prints",
 * "is:errata sort:cost". Flag-like keys keep their value, since the value
 * is the whole point of the key; every other value is dropped, so the
 * result says how the search was asked, never what was looked for. Used
 * by the query API's counter and by the site's search beacon. */
export function queryKeys(q: string): string {
  const keys = new Set<string>();
  for (const m of q.matchAll(/(?:^|[\s(])-?([a-z]+)(?:[:=]([a-z-]*)|[<>!])/gi)) {
    const key = m[1]!.toLowerCase();
    const value = (m[2] ?? "").toLowerCase();
    keys.add(["is", "has", "unique", "sort", "order"].includes(key) && value ? `${key}:${value}` : key);
  }
  return [...keys].sort().join(" ").slice(0, 200);
}
