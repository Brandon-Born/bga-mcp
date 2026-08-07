# Documentation source and provenance policy

Reviewed: 2026-08-07. Backlog item: BGA-200. Boundary: TB-DOCS-NETWORK.

[`config/doc-sources.json`](../config/doc-sources.json) is the machine-readable source of truth; this file is its human-readable view. `pnpm verify:doc-sources` fails when a source is unapproved, unattributable, incompletely classified, or permits more than its operator allows.

A source that is not in the catalog may not be fetched. That is the whole point of the catalog: the decision about whose text ends up in a developer's agent is made here, in review, and not at request time.

## The sources

| Source                          | Authority                      | Licence     | Retrieval           |
| ------------------------------- | ------------------------------ | ----------- | ------------------- |
| BGA Studio framework reference  | official-maintained            | none stated | on-demand, one page |
| BGA Studio community wiki pages | official-host-community-edited | none stated | on-demand, one page |

Both live on `en.doc.boardgamearena.com`. They are separate entries because **authority is not the same as host**. The framework reference is written by the BGA team. [BGA Studio Cookbook](https://en.doc.boardgamearena.com/BGA_Studio_Cookbook) invites anyone to add recipes and BGA does not vouch for individual entries — so a result from it is labelled community, even though its URL is on the official host, and a rule derived from it is a heuristic.

Every source is `editable: true`. It is a wiki. Being authoritative about the framework and being attacker-influenced are both true at once, and the catalog records both.

## What the sources permit

Checked on 2026-08-07 at [robots.txt](https://en.doc.boardgamearena.com/robots.txt):

```
User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /
```

with `Disallow: /` for Amazonbot, Applebot-Extended, Bytespider, CCBot, ClaudeBot, CloudflareBrowserRenderingCrawler, Google-Extended, GPTBot, and meta-externalagent.

That is unusually explicit, and it decides the design:

- **`search=yes`** — building a search result, returning a link and a short excerpt, is permitted.
- **`ai-train=no`** — no training or fine-tuning, ever. The catalog cannot express permission for it.
- **`use=reference`** — reference-level consumption. A capability may quote a page and cite it; it may not reproduce the page.
- **`ai-input` unspecified** — neither granted nor restricted. Read conservatively, as `use=reference` already describes.
- **Every named AI crawler is refused.** A site that refuses nine AI crawlers by name has said what it thinks of automated bulk collection. So `bulkCrawl` is `false` for both sources, whatever the general `Allow: /` would otherwise permit.

**No content licence is published anywhere on the wiki.** Checked the Main Page footer, the About and Disclaimers links, and the page footers. No licence stated means all rights reserved, not public domain — so full text is never redistributed and never retained, only linked and briefly quoted with attribution.

## What follows for the capabilities

- Retrieval is **one page, for one explicit request**. No crawl, no corpus, no vendored snapshot in the published package.
- The user agent identifies this project honestly. It never imitates a browser or another crawler.
- Every result carries its source URL, its snapshot date, and whether it is official or community.
- Retrieved text is **untrusted content**. It is data an agent reads, never instruction it follows, however it is phrased. See RR-DOC-INJECTION-RESIDUAL in the [threat model](THREAT_MODEL.md): labelling reduces the chance an agent treats documentation as instruction and cannot eliminate it.
- Cache is bounded — 30 days for the maintained reference, 7 for community pages, which change less predictably — and nothing is served without its date.

## Adding a source

1. Fetch its `robots.txt` and record the raw signals with the date.
2. Look for a content licence and record where you looked, so `none-stated` is a finding rather than an assumption.
3. Classify authority honestly. Official host does not mean official content.
4. Set `allowedUse` no wider than the signals and the licence permit. The gate rejects an entry that exceeds either.
5. Add the entry, update this file, and run `pnpm check`.

## Shipping is still blocked

The boundary is reviewed, not open. The [boundary review](verification/DOCS_BOUNDARY_REVIEW.md) records seven preconditions; this item implements the provenance and trust half of one of them (TM-DOC-PROVENANCE). No documentation capability may be advertised until all seven exist, and the capability gate enforces that.
