# Kairos Archive redesign review

Implementation branch: `design/archive-refresh`.
Site baseline: `12f7e29cb7fceff6c247f342b8bab1c6e937735f`.
Registry reviewed: `43a155f1028d811f857f64c495383d50c79a6145` (schema 11).

This is a review candidate, not a visually approved release. No remote branch,
production deployment, or registry modification was made.

## Implemented

- One homepage search, compact dragon and text wordmark, system serif headings,
  copper accents, light/dark themes, and a navigation menu.
- Explore the archive: Browse sets; Changes and Errata; Read the documentation.
- Advanced query builder using the existing search key definitions and actual sets.
  The generated query remains editable and is submitted in the URL.
- Card layout with a smaller expandable image, current rules, distinct printing
  statuses, complete raw card facts, IDs, image renditions and JSON actions.
- Stacked printing entries, each with its own as-printed comparison. Physical
  details, retirement, slug and record links are retained.
- Source-labelled history, complete initial values, front/back comparisons, and
  word-level highlighting that preserves the exact text on both sides.
- Changes page with readable before/after comparisons, optional jump navigation,
  and distinct handling of an errata flag without stored comparison history.
- Set catalogue and set indexes grouped by type, alphabetically within each group.
- Five API documentation pages: getting started, endpoints/releases,
  cards/printings, history/errata, images. Examples use Astro's built-in highlighting.
- Responsive syntax reference, copyable printing IDs, JSON links on set pages,
  and direct image links for front and back faces at every available rendition.
- PhotoSwipe is the only added dependency. The viewer is dynamically imported on
  opening. No webfonts, UI framework, CSS framework, routing framework or backend.
- Native menu/clipboard/download enhancements; autocomplete retains combobox
  semantics and slash focus, adds aria-selected, handles fetch failure, and now
  waits for input before loading the name index.

## Preserved boundaries

The registry repository, data loader, digest verification, retries, search parser,
evaluator, compact search payload, route configuration and redirect generator
were not changed. Card names/rules are rendered from the export, never corrected
in the site. The publisher credit and usage links remain on every page.

The JSON links intentionally retain the registry's current-record API URLs, which
follow the moving major alias. The documentation explains how to stay pinned to
an immutable release. Download JSON fetches that same API response as a file;
View JSON remains available if CORS or download support fails.

## Verification completed

- Production build from the included registry export: 4,209 pages, approximately
  22 seconds in this environment (baseline: 4,203 pages, approximately 16 seconds).
- 82 unit tests pass: all 71 pre-existing checks plus 11 exact-text diff checks.
- `npm run check`: zero errors and warnings; one pre-existing ESLint API
  deprecation hint.
- `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, `git diff --check`: pass.
- `python scripts/review-build.py ../sorcery-registry/export/registry.json`: pass
  across every generated page, checking internal links/anchors, one search field,
  attribution/docs navigation, exact current rules (including backs), printing
  links, copyable IDs, JSON/image links and all 1,100 card redirects.
- Search bundle unchanged at 21,760 bytes. Shared Base script: approximately
  2.0 KB gzip. Card image lightbox entry: approximately 5.3 KB gzip; dynamically
  loaded viewer: approximately 17.4 KB gzip. Full output approximately 37.7 MB
  in file bytes; filesystem allocation can report a larger number.

## Outstanding browser verification

The provided browser cannot reach this workspace's localhost server. Opening the
shared build file was explicitly rejected by browser URL security policy. No
alternate browser mechanism was used. Consequently there are no verified
screenshots and no claim of browser-tested layout or behaviour.

Before merge, review at 360/390 px mobile widths and desktop, in both themes:

- Home: single search, slash focus, name autocomplete with arrow/Enter/Escape,
  normal query submission and navigation menu keyboard behaviour.
- Search: name/rules-only groups, filtering, sort, pagination and browser back.
- Card: `/cards/C000139/askelon-phoenix` (errata and low-resolution art).
- Raw asymmetric stats: `/cards/C000429/black-knight` (attack 5, defense 3).
- Back faces: `/cards/C000459/druid` and `/cards/C001099/foot-soldier`.
- Missing art: `/printings/P002557`.
- No-card-text and current printing statuses; unknown is covered by existing
  data-helper tests but is absent from this release.
- Long printing entries and expanded differences: no horizontal page overflow.
- PhotoSwipe: open, zoom, Escape, focus return, reduced motion and failed image.
- Copy IDs and code; download JSON; each image rendition and original.
- All five documentation pages, narrow syntax tables, small/large set pages,
  tokens, usage and about pages.

## Findings for consideration

1. **Registry documentation mismatch.** `docs/api.md` says indexes carry record
   URLs. `registry/publish.py`'s CARD_INDEX and PRINTING_INDEX do not include
   `api_url` or `kairos_url`. CARD_INDEX also has attack/defense/power/life that
   the prose field list omits. New site docs describe the code's actual shape.
   The registry docs should be corrected separately.
2. **CI does not run Astro's template checker.** Existing CI uses TypeScript's
   `tsc`, which does not replace `astro check` for `.astro` templates. Consider
   adding `npm run check` to the workflow. It was run locally for this change.
3. **Search result destinations.** In every-printing mode, the current search UI
   still links tiles to card pages rather than the matched printing. That is
   pre-existing and unchanged; a printing-specific destination would make the
   results less ambiguous.
4. **Search explanations.** Matching on artist or thresholds is not explained on
   result tiles. This merits a separate evaluator/UI change with tests for OR,
   negation and same-printing matching. Simple labels must not invent match reasons.
5. **Build provenance versus current API.** A page is built from a snapshot but
   its API URL follows current data. Existing links intentionally work this way.
   A future optional 'this release' JSON link could make comparisons reproducible.
6. **Brand source.** The existing dragon raster is preserved. A designer-supplied
   vector master would sharpen the mark without reinterpreting the logo.

## Local review

Requires Node 22 or newer. From the site repository:

```sh
npm ci
KAIROS_REGISTRY_FILE=../sorcery-registry/export/registry.json npm run dev
```

PowerShell:

```powershell
npm ci
$env:KAIROS_REGISTRY_FILE = '../sorcery-registry/export/registry.json'
npm run dev
```

Open the local URL Astro prints. A local export build deliberately labels the
footer release as `local`. Images still load from the registry's image domain.
For a production-equivalent data fetch, unset KAIROS_REGISTRY_FILE and build
normally, optionally setting KAIROS_REGISTRY_TAG to a verified release tag.

The review ZIP includes both the site sources and the registry export at the
relative path above. Install dependencies locally; node_modules is not included.
