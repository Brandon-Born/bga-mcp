# Executable contract context — BGA-431

```verification-record
{
  "kind": "review",
  "scope": "BGA-431 original inert-example defect, executable controls and lexical uncertainty"
}
```

The original rc.2 observation remains unchanged in
[bga431-observed-v1.0.0-rc.2.json](bga431-observed-v1.0.0-rc.2.json). A comment-only
handler suppressed a real missing-handler warning, and a comment-only PHP method
supplied game-method existence. Existing passing tests did not cover that case.

JavaScript notification reading now uses Acorn 8.18.0, an exact runtime dependency.
A complete module parse, then a script parse for non-strict legacy programs,
identifies declarations and calls. Project code is never executed. Comments and
string/regex/template text cannot declare methods or calls; executable template
substitutions remain readable. Payload reads belong to the method body, rather
than a fixed character window. Literal promise prefix/ignore options and manual
subscriptions remain readable. Computed/conflicting registration, dynamic
properties, unreadable function values and unknown grammar explicitly reduce
coverage. There is no raw-text recovery. Valid independently readable pairs still
permit payload comparisons; unreadable sides cannot establish absence.

PHP sends and method inventory use bounded lexical masks. Comments cannot supply
calls, declarations, argument punctuation or payload keys; quoted strings,
backticks and heredoc/nowdoc content cannot supply code. UTF-16 offsets and CR/LF
positions are retained, including astral characters. Unterminated contexts and
closing tags/mixed HTML are explicitly unsupported by the affected readers.
This is not a complete PHP parser, syntax validator, scope resolver, runtime
call graph or control-flow evaluator. Other action/database readers retain their
existing documented scope. Typed TypeScript and proposal syntax outside Acorn's
JavaScript grammar are unsupported rather than searched as raw text.

Original fixtures contain no published/private game source, credentials or art.
Five installed scenarios cover the original negative, positive live controls,
unknown JavaScript/PHP contexts and a legacy dispatcher whose game method is only
a comment. Tools, aggregate, diagnostics/summary resources and pre-release retain
the findings or uncertainty. They use the shared tarball, installed public
command and real MCP SDK client, prove unchanged projects and wait for process
exit. Focused units cover lexical forms, independent registrations, payload
boundaries, unsupported options, legacy non-strict parsing and cooperative
monotonic cancellation. File-size/read budgets and policy boundaries are retained;
no filesystem, network, subprocess or project-code execution is added to the
production parser. Parsing has token/comment checkpoints; existing byte limits
bound single-token work.

The first complete run passed 650 tests and exposed the installed candidate
contract mismatch. The additional internal declarations and compatibility claim
require a new declaration fingerprint in the unpublished `1.0.0` candidate
snapshot. Its exact rc.2 predecessor is preserved under
`config/contracts/history/1.0.0-rc.2.json` and in the original tags/packets; no
published stable snapshot exists. Tool/resource descriptors, input/output and
versioned-schema fingerprints are unchanged. The strict installed comparison
remains enabled. Local full-gate and exact-source CI observations will be
appended after they pass.
The package source version is reserved as `1.0.0-rc.3`; that is not yet a produced
or signed replacement artifact. BGA-431 remains implemented until its required
gates pass. BGA-424 remains implemented until verified replacement bytes repeat
the affected frozen-task calls. No rc.1/rc.2 receipt or result silently transfers.

## Sources

Fetched 2026-10-01 local, beginning at the official Studio file reference:

- [Studio file reference](https://en.doc.boardgamearena.com/Studio_file_reference).
- [Game interface logic](https://en.doc.boardgamearena.com/Game_interface_logic:_Game.js):
  promise registration will “Auto-detect all notifications declared on the game object”.
- [Main game logic](https://en.doc.boardgamearena.com/Main_game_logic:_Game.php) and
  [state classes](https://en.doc.boardgamearena.com/State_classes:_State_directory)
  document modern, deprecated legacy and state shortcut sends independently.
- [ECMAScript comments](https://tc39.es/ecma262/multipage/ecmascript-language-lexical-grammar.html#sec-comments):
  “Comments behave like white space and are discarded”. The surrounding lexical
  grammar distinguishes regex, division and template contexts.
- [PHP comments](https://www.php.net/manual/en/language.basic-syntax.comments.php)
  documents line/block forms and closing-tag behavior.
- [PHP execution operators](https://www.php.net/manual/en/language.operators.execution.php)
  identifies backticks as shell-command content, never a declaration inventory.
- [Acorn README](https://github.com/acornjs/acorn/blob/master/acorn/README.md)
  warns the standalone tokenizer “uses heuristics” and advises full `parse` with
  `onToken`. The bundled pinned README was also read. No new grammar is inferred
  from token text or parser error messages.

## Local full gate

`corepack pnpm check` passed on macOS arm64 / Node 22.17.1 after the candidate
snapshot update: 651 tests, 193 required scenarios, 17 capabilities and 100
retained claims. The five new installed scenarios passed together with all
legacy/modern/hybrid and seeded uncertainty controls. Coverage, package lint,
applicable official conformance, policy/threat-model and secret/artifact gates
passed. This dirty-source local run precedes the clean committed CI observation;
it is not yet a candidate-production or signing receipt.

## Clean source and retained candidate observations

[Exact-source CI](bga431-source-ci.json) passed all six jobs at `c7ad5c2`.
The [rc.3 candidate receipt](release-candidate-v1.0.0-rc.3.json) records the actual
non-publishing producer, fresh audits and identical reconstruction. The
[fixed original probe](bga431-fixed-v1.0.0-rc.3.json) reports no handler, only live
PHP methods and the missing-handler warning; all three previous failures are
absent. Its fixture and runner digests match the historical rc.2 observation.
All projects and client configuration were unchanged and processes exited.
BGA-431's parser correction is verified for the identified source and original
candidate bytes. Signing and explicit frozen-task carry-forward still gate
BGA-424 closure; code verification alone does not transfer that evaluation.
