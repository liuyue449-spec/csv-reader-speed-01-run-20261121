# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/liuyue449-spec/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/liuyue449-spec/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, for make.fun's "Read broken CSV files faster, 21 November 2026" bounty, $100 in prizes. `solve.js` answers every case exactly as csv-reader 1.0.0 does — same `{columns, rows, errors}`, including its broken-row policy (BOM, stray CR, quote junk, unterminated quotes, short/long rows) — and runs about 5x faster on the practice set.

## Run it

```sh
node main.ts
```

It reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`) and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`).

## How it is faster

The reference reader builds every field one character at a time. This one slices plain unquoted fields and clean quoted fields straight out of the text, and only walks character by character down the rare paths: a stray CR, a quoted field holding a doubled quote or a line break, junk after a closing quote, and a quote that never closes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=y9xqfw0n&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
