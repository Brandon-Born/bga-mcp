# Captured documentation pages

These are fragments of third-party pages, kept so that reading them can be
tested without asking someone else's server a question on every commit. They
are evidence, not content the project ships: nothing here is served to a
client, and the package's `files` list does not include this directory.

The source states no content licence, which means all rights reserved rather
than free to copy ([`config/doc-sources.json`](../../../config/doc-sources.json)
records the check). So each capture is the smallest fragment that makes the
behaviour under test observable — the heading, the list under it, and the
markup that bounds them — never a page.

A capture is refreshed only by a deliberate review: `pnpm docs:drift` reports
that a tracked page changed, a person reads what changed, and the capture and
the expectations in the test move together. A test that fails because the wiki
changed is the signal working, not a test to relax.

| File                                       | Source                                                                                                              | Authority           | Retrieved  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------- |
| `studio-software-versions.html`            | <https://en.doc.boardgamearena.com/Studio#Software_Versions> (revision 30894)                                       | official-maintained | 2026-08-09 |
| `studio-software-versions-2026-04-01.html` | <https://en.doc.boardgamearena.com/index.php?title=Studio&oldid=29247> — the same section as it stood on 2026-04-01 | official-maintained | 2026-08-09 |

The older revision is kept because "the reader reports what the page says now"
is only provable against a page that once said something else. It is a real
past revision of the same page, not a constructed one: it lists `Dojo Toolkit
1.15` with no deprecation note and `SQL: MySQL 5.7` with no Studio value, both
of which the current revision states differently.

The remaining cases in [`tests/unit/framework-versions.test.ts`](../../unit/framework-versions.test.ts)
— a table of contents moved after the section, a missing section, an emptied
section, an added duplicate — are derived from these captures inside the test,
so what they change is written down beside the assertion that depends on it.
