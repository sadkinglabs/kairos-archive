import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { writeFile } from "node:fs/promises";
import { loadRegistry } from "./src/data/registry.ts";
import { redirectLines } from "./src/data/redirects.ts";

// Cloudflare Pages redirects bare /cards/{id} (the old permanent link) and
// old /cards/{id}/{old-slug} links (from a card rename) to the canonical
// /cards/{id}/{slug} page via its own _redirects file, read from the build
// output root. Astro ignores any pages/ file or route prefixed with "_"
// (that's how you keep non-route helpers in pages/), so this can't be an
// Astro endpoint at src/pages/_redirects.ts - write it directly once the
// static build has finished instead. One bare-id line per card (~1,100
// today) plus one old-slug line per renamed card whose slug actually
// changed (very few - renames are rare and most name edits are
// punctuation-only, which doesn't touch the slug) stays well under
// Cloudflare's 2,000 static redirect limit, so there is no need for
// dynamic (:splat-style) rules.
function cardRedirects() {
  return {
    name: "kairos-card-redirects",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const { registry } = await loadRegistry();
        // 302, not 301: both kinds of target carry the card's current name
        // and move on a rename, and browsers cache a 301 indefinitely.
        const lines = redirectLines(registry);
        await writeFile(new URL("_redirects", dir), lines.join("\n") + "\n");
      },
    },
  };
}

// Static output: every page is pre-rendered at build time from one
// verified registry release (see src/data/registry.ts). Cloudflare Pages
// serves dist/ at the apex; the release workflow of sorcery-registry
// triggers a rebuild through the Pages deploy hook.
export default defineConfig({
  site: "https://kairosarchive.net",
  output: "static",
  trailingSlash: "never",
  // Every script and stylesheet is an external file, always: the site's
  // Content-Security-Policy (public/_headers) allows only 'self' for both,
  // and Astro would otherwise inline a page script that bundles under 4 KB
  // and any stylesheet it judges small enough - which the browser would
  // then refuse to run.
  build: { format: "file", inlineStylesheets: "never" },
  // esbuild for CSS, as before Vite 8: Lightning CSS would rewrite
  // @media (max-width: 740px) as (width <= 740px), which Safari before
  // 16.4 does not read - the phone layout would silently vanish there.
  vite: { build: { assetsInlineLimit: 0, cssMinify: "esbuild" } },
  integrations: [
    cardRedirects(),
    sitemap({
      // The 404 page and bare /cards/{id} links (superseded by the
      // _redirects rules above) aren't destinations worth indexing.
      // /random needs no exclusion: it is a Pages Function, not a page.
      // /search is left out because public/robots.txt refuses it, and a
      // sitemap that lists a refused URL contradicts itself.
      filter: (page) => !page.endsWith("/404")
        && new URL(page).pathname !== "/search"
        && !/\/cards\/[^/]+$/.test(new URL(page).pathname),
    }),
  ],
});
