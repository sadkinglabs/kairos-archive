/** The page's own path, as the site serves it.
 *
 * With build.format "file", Astro.url.pathname during a build is the output
 * file - /sets.html, /docs/cards.html, /index.html - while in dev it is the
 * route, /sets. The site serves neither with an extension, so anything
 * compared against a link, or written into a canonical URL, needs the
 * served form. Three things had quietly depended on the raw value: the
 * menu's aria-current (never matched in a build), the docs pages' canonical
 * (carried .html), and the home page's "no second search box" (broke when
 * Astro 7 started reporting /index.html rather than /). */
export function pagePath(pathname: string): string {
  const path = pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  return path === "" ? "/" : path;
}
