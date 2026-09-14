import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { writeFile } from "node:fs/promises";
import { cardPath, loadRegistry } from "./src/data/registry.ts";

// Cloudflare Pages redirects bare /cards/{id} (the old permanent link) to
// the canonical /cards/{id}/{slug} page via its own _redirects file, read
// from the build output root. Astro ignores any pages/ file or route
// prefixed with "_" (that's how you keep non-route helpers in pages/), so
// this can't be an Astro endpoint at src/pages/_redirects.ts - write it
// directly once the static build has finished instead. One line per card
// (~1,100 today) stays well under Cloudflare's 2,000 static redirect limit,
// so there is no need for dynamic (:splat-style) rules.
function cardRedirects() {
  return {
    name: "kairos-card-redirects",
    hooks: {
      "astro:build:done": async ({ dir }) => {
        const { registry } = await loadRegistry();
        const lines = registry.cards.map((c) => `/cards/${c.codex_id} ${cardPath(c)} 301`);
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
  build: { format: "file" },
  integrations: [
    cardRedirects(),
    sitemap({
      // The 404 page and bare /cards/{id} links (superseded by the
      // _redirects rules above) aren't destinations worth indexing.
      filter: (page) => !page.endsWith("/404") && !/\/cards\/[^/]+$/.test(new URL(page).pathname),
    }),
  ],
});
