# Kairos Archive

[kairosarchive.net](https://kairosarchive.net): search, a page per card with every printing and its whole history, a page per printing, and the set catalogue for *Sorcery: Contested Realm* — built on the [Sorcery Card Registry](https://github.com/sadkinglabs/sorcery-registry) and served from one verified registry release.

## How it works

- **Static.** [Astro](https://astro.build) pre-renders every page at build time. There is no server; Cloudflare Pages serves `dist/` at the apex.
- **One verified release.** At build, `src/data/registry.ts` reads `https://api.kairosarchive.net/versions.json`, takes `latest.v3`, fetches that immutable root's `registry.json` and checks its SHA-256 against the digest `versions.json` lists. A mismatch fails the build. `KAIROS_REGISTRY_TAG` pins a tag; `KAIROS_REGISTRY_FILE` builds from a local export (development, tests, no network).
- **Search in the browser.** `src/search/` is the Kairos query language: a key table (`keys.ts`) that drives both the parser and the `/syntax` page, a tokenizer and parser (`query.ts`), and an evaluator (`evaluate.ts`) that runs over `/data/search.json`, a compact payload generated from the same release. Card keys filter cards; every printing key in a query must be satisfied by one and the same printing. Pure TypeScript, no DOM, unit-tested per key, operator and flag.
- **Images** come from `api.kairosarchive.net/images/` (the registry hosts them as the publisher's API guidance asks) and are displayed with `border-radius: 4.75% / 3.5%`.
- **Rebuilds.** The registry's release workflow POSTs the Pages deploy hook after every verified release, so the site always shows the newest data.

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
