# Robust Dimension/Measure Classification Update - 2026-03-17

- Time: `2026-03-17 20:09:35 IST`

## Why this change
Some numeric clinical fields were being classified as `Dimension` due to brittle substring heuristics (e.g., names containing fragments like `id`) and aggressive low-cardinality logic.

## What was changed
File updated: `apps/server/src/pipelines/schema-inference/classifyColumns.js`

1. Added name normalization + tokenization
- New helpers:
  - `normalizeColumnName(name)`
  - `tokenizeColumnName(name)`
  - `hasTokenMatch(tokens, keywords)`
  - `countTokenMatches(tokens, keywords)`

2. Replaced substring keyword matching with token-based matching
- Old: `nameLower.includes(kw)`
- New: exact token matches on normalized column tokens
- This avoids false positives like partial substrings.

3. Improved numeric cardinality rule
- Old low-cardinality rule: `uniqueCount <= 10`
- New conservative rule: `uniqueCount <= 12 && cardinalityRatio <= 0.2`
- Ratio now uses robust denominator: `max(nonNullSamples.length, totalRows, 1)`

4. Added weighted scoring for tie-breaks
- Scores combine:
  - data type signal
  - cardinality signal
  - keyword hit counts
- Numeric fallback now uses score comparison instead of fixed default-only behavior.

## Expected behavior improvements
- Numeric fields are less likely to be misclassified as `Dimension` from accidental substring matches.
- Low-cardinality numeric columns still can become `Dimension` when they genuinely look categorical.
- Classification decisions are more stable on mixed/ambiguous datasets.

## Validation
- Static diagnostics: no errors in updated file.
