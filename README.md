# Kairos Archive

[kairosarchive.net](https://kairosarchive.net): search, a page per card with every printing and its whole history, a page per printing, and the set catalogue for *Sorcery: Contested Realm* — built on the [Sorcery Card Registry](https://github.com/sadkinglabs/sorcery-registry) and served from one verified registry release.

## How it works

- **Static.** [Astro](https://astro.build) pre-renders every page at build time. There is no server; Cloudflare Pages serves `dist/` at the apex.
- **One verified release.** At build, `src/data/registry.ts` reads `https://api.kairosarchive.net/versions.json`, takes `latest.v3`, fetches that immutable root's `registry.json` and checks its SHA-256 against the digest `versions.json` lists. A mismatch fails the build. `KAIROS_REGISTRY_TAG` pins a tag; `KAIROS_REGISTRY_FILE` builds from a local export (development, tests, no network).
- **Search in the browser.** `src/search/` is the Kairos query language: a key table (`keys.ts`) that drives both the parser and the `/syntax` page, a tokenizer and parser (`query.ts`), and an evaluator (`evaluate.ts`) that runs over `/data/search.json`, a compact payload generated from the same release. Card keys filter cards; every printing key in a query must be satisfied by one and the same printing. Pure TypeScript, no DOM, unit-tested per key, operator and flag.
- **Images** come from `api.kairosarchive.net/images/` (the registry hosts them as the publisher's API guidance asks) and are displayed with `border-radius: 4.75% / 3.5%`.
- **Rebuilds.** The registry's release workflow POSTs the Pages deploy hook after every verified release, so the site always shows the newest data.

## Usage counts

Three things are counted, and nothing else; the [usage page](https://kairosarchive.net/usage) says so publicly.

- **The site** loads Cloudflare Web Analytics (page views, referrers; no cookie, no identifier) when `PUBLIC_CF_BEACON_TOKEN` is set at build time, and sends a beacon to the stats Worker for two events: clicks on links that leave the site (the host they go to, the page, the link's `data-track` label when it has one) and searches (the keys the query used, from `src/search/keysUsed.ts`, and how many results it found; `-1` when the query was rejected). Never the words typed. A page reports a search by dispatching a `kairos:stat` event on `document`; the layout sends it.
- **The query API** (`worker/src/stats.ts`) and **the bot** write one Analytics Engine data point per request: route or command, outcome, client software as a family, country, query keys, latency. Never the address, the query text or the full `User-Agent`.
- **The stats Worker** (`stats/`, on `stats.kairosarchive.net`) takes the beacon at `POST /event` (only from the site's origin) and serves the owner's dashboard at `GET /`, behind Cloudflare Access: the Access token is verified in the Worker too, so a hostname without a policy fails closed. The page reads the three datasets through the Analytics Engine SQL API, Discord's list of the servers the bot user is in, and the zone's sampled request analytics for the API host, which is R2 behind the CDN with no Worker to count for it. Zone analytics on the Free plan answer one day per query; the Worker asks day by day, up to 30 requests per view, and says how many days the numbers cover. Whole-dataset downloads are counted on the exact `registry.json` paths of every release listed in `versions.json`.

Setting up the dashboard, once:

1. **Access.** Zero Trust → Access → Applications → add a self-hosted application for `stats.kairosarchive.net` with a policy allowing your email (one-time PIN). Note the application's **Audience (AUD) tag** and your **team domain** (`<team>.cloudflareaccess.com`).
2. **An API token** with *Account Analytics: Read* and *Zone Analytics: Read* for the zone.
3. **Repository secrets:** `STATS_CF_API_TOKEN` (that token), `CF_ZONE_ID`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `DISCORD_BOT_TOKEN` (the bot's, for install counts). `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are the ones the other deploys already use.
4. **Web Analytics.** Analytics & Logs → Web Analytics → add the site, copy the token into the Pages project's build variable `PUBLIC_CF_BEACON_TOKEN`, and redeploy.
5. Run the **deploy-stats** workflow (it also runs on every push touching `stats/`). It deploys, pushes the secrets that are set, and checks `/health`, that `/` refuses without Access, and that `/event` refuses another origin.

The bot's `STATS_SALT` secret keys its server hash; without it the bot writes no server hash at all.

## Develop

```bash
npm ci
KAIROS_REGISTRY_FILE=../sorcery-registry/export/registry.json npm run dev   # or omit the variable to fetch the newest release
npm test          # search grammar
npm run lint
npm run build
```

## Credits and terms

Card names, rules text, typelines, flavour text, artist credits and images are © Erik's Curiosa, shown with credit for archive, identification and site function. Identifiers, structure, histories and code are Kairos Archive's and free for any use; see [usage](https://kairosarchive.net/usage) (canonical text: the registry's `docs/usage.md`). Code in this repository is MIT licensed.
