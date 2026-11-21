# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/qw123gyj-dev/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/qw123gyj-dev/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` answers every case exactly as csv-reader does — same `{columns, rows, errors}`, same broken-row policy (BOM drop, LF/CRLF ends, stray CRs, quoted fields with doubled quotes and line breaks inside, quote junk, unterminated quotes, short/long rows) — but in far less CPU time.

## Approach

The reference builds every field one character at a time (`value += c`), which allocates a new string per character. This entry never does that:

- **Slice, don't concatenate.** Fields are taken with `String.slice` over spans located by the native `indexOf`, so the hot loop only walks character codes at boundaries.
- **Whole-line fast path.** A record whose line holds no quote and no stray CR is split natively in one go; that covers most records in the drawn sets.
- **Exact slow paths, only when needed.** Stray CRs, doubled quotes, CR/LF inside quotes, quote junk and unterminated quotes are rare, and each is handled by a small routine that mirrors the reference step for step — including error order, `line` (counting every LF/CRLF/lone CR inside quotes) and `row` (record index in `rows`, `null` for the header).
- **Same driver as the house baseline.** `main.ts` reads `/input/cases.json`, answers each case alone with `run`, writes `/output/answers.json`, with V8 incremental marking off (`--no-incremental-marking`).

## Run it

```sh
# practice set: cases in practice/input/cases.json, reference in practice/reference/expected.json
MAKEFUN_INPUT_DIR=<kit>/practice/input MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

Node 22, no dependencies, no install step. `solve.js` is a dependency-free ES module; `main.ts` is the program the harness runs (`node /bot/main.ts`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=ec3esm0k&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
