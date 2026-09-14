import { defineConfig } from "astro/config";

// Static output: every page is pre-rendered at build time from one
// verified registry release (see src/data/registry.ts). Cloudflare Pages
// serves dist/ at the apex; the release workflow of sorcery-registry
// triggers a rebuild through the Pages deploy hook.
export default defineConfig({
  site: "https://kairosarchive.net",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
});
