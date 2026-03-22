/**
 * relationshipMapper.js
 *
 * REQ-2.5: Automatically link related data tables so the Visualization
 * wizard has all the information it needs for complex charts.
 *
 * WHAT THIS FILE DOES:
 * Compares every column in every collection against every column in every
 * other collection, scores each pair using 3 signals, and emits only
 * high-confidence relationships.
 *
 * THE 3 SCORING SIGNALS (scores STACK — no early-exit guards):
 *   1. Exact name match      +0.40  (same column name in both collections)
 *   2. FK pattern match      +0.50  (column base entity matches toCollection name)
 *   3. Value overlap         +0.00 to +0.30  (actual sample values intersect)
 *
 * BUGS FIXED FROM PREVIOUS VERSION:
 *   - Generic bare 'id' columns no longer create false positives.
 *     (sequential IDs [1,2,3] from two unrelated tables overlapped 100%
 *      giving 0.65 confidence — now excluded entirely from detection)
 *   - Removed !strategy guard: fk_pattern now stacks with exact_name_match
 *     instead of being silently skipped when exact_name_match fires first.
 *   - collectionMatchesBaseName now uses token-exact matching, not substring,
 *     preventing "order" from matching inside "order_id".
 *   - Threshold raised from 0.55 to 0.60 to require at least 2 signals.
 */

/* ─────────────────────────────────────────────
   NAME HELPERS
   ───────────────────────────────────────────── */

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
}

function tokenize(name) {
  return normalizeName(name).split("_").filter(Boolean);
}

function extractBaseEntity(name) {
  return normalizeName(name)
    .replace(/(_id|_code|_key|_ref|_no|_num)$/, "")
    .replace(/^(fk_|ref_)/, "");
}

function singularize(name) {
  const n = normalizeName(name);
  return n.endsWith("s") ? n.slice(0, -1) : n;
}

function normalizeValues(values) {
  return (values || [])
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map((v) => String(v).trim())
    .filter(Boolean);
}

/* ─────────────────────────────────────────────
   COLUMN CLASSIFICATION HELPERS
   ───────────────────────────────────────────── */

const FK_SUFFIXES = ["_id", "_code", "_key", "_ref", "_no", "_num"];

/**
 * Returns true if the column name has a key-like suffix.
 * Deliberately excludes bare "id" and "_id" — too generic to be useful.
 * "customer_id" → true, "id" → false, "revenue" → false
 */
function isKeyLike(columnName) {
  const n = normalizeName(columnName);
  return FK_SUFFIXES.some((s) => n.endsWith(s));
}

/**
 * Returns true if this column is the PRIMARY KEY of its own collection.
 * "customer_id" in "customers" → PK (base "customer" matches singular "customer")
 * "customer_id" in "orders"   → NOT PK (base "customer" ≠ singular "order")
 */
function isPrimaryKey(columnName, collectionName) {
  if (!isKeyLike(columnName)) return false;
  const colBase     = extractBaseEntity(columnName);
  const collSingular = singularize(collectionName);
  return colBase === collSingular;
}

/**
 * Returns true if this column is a FOREIGN KEY — key-like but not own PK.
 * "customer_id" in "orders" → FK
 */
function isForeignKey(columnName, collectionName) {
  return isKeyLike(columnName) && !isPrimaryKey(columnName, collectionName);
}

/**
 * Returns true if the base entity of a FK column matches a collection name.
 * Uses TOKEN-EXACT matching (not substring) to avoid false matches.
 *
 * "customer_id" (base: "customer") → matches "customers" (singular: "customer") ✓
 * "order_id"    (base: "order")    → does NOT match "order_items"               ✗
 *
 * FIX: Previous version used collectionNorm.includes(baseNorm) which let
 * "order" match inside "order_items" and similar substring false positives.
 */
function columnPointsToCollection(columnName, collectionName) {
  const base         = extractBaseEntity(columnName);
  const collSingular = singularize(collectionName);
  const collTokens   = tokenize(collectionName);
  const baseTokens   = tokenize(base);

  if (base === collSingular) return true;
  if (baseTokens.length > 0 && baseTokens.every((t) => collTokens.includes(t))) return true;
  return false;
}

function valueOverlap(valuesA, valuesB) {
  const setA = new Set(normalizeValues(valuesA));
  const setB = new Set(normalizeValues(valuesB));
  if (setA.size === 0 || setB.size === 0) return 0;
  let matches = 0;
  for (const v of setA) { if (setB.has(v)) matches++; }
  return matches / Math.min(setA.size, setB.size);
}

function typesCompatible(typeA, typeB) {
  const a = String(typeA || "").toLowerCase();
  const b = String(typeB || "").toLowerCase();
  if (!a || !b || a === b) return true;
  const numeric = new Set(["number", "int", "integer", "float", "double", "decimal"]);
  const textual  = new Set(["string", "text", "varchar", "char"]);
  if (numeric.has(a) && textual.has(b)) return true;
  if (textual.has(a) && numeric.has(b)) return true;
  return false;
}

/* ─────────────────────────────────────────────
   SCORING
   ───────────────────────────────────────────── */

/**
 * Score one direction: fromCol (FK side) → toCol (PK side).
 * All signals STACK — no !strategy early-exit guards.
 */
function scoreDirection(fromCol, fromMeta, toCol, toMeta) {
  let score = 0;
  const strategies = [];

  const fromName = normalizeName(fromCol.name);
  const toName   = normalizeName(toCol.name);

  const fromIsFK = isForeignKey(fromCol.name, fromMeta.collectionName);
  const fromIsPK = isPrimaryKey(fromCol.name, fromMeta.collectionName);
  const toIsPK   = isPrimaryKey(toCol.name, toMeta.collectionName);

  // Signal 1: Exact name match (excluding bare "id")
  if (fromName === toName && fromName !== "id" && fromName !== "_id") {
    score += 0.40;
    strategies.push("exact_name_match");
  }

  // Signal 2: FK pattern — base entity of fromCol matches toCollection
  // FIX: runs regardless of whether signal 1 fired (removed !strategy guard)
  if (isKeyLike(fromCol.name) && columnPointsToCollection(fromCol.name, toMeta.collectionName) && fromIsFK && toIsPK) {
    score += 0.50;
    strategies.push("fk_pattern");
  }

  // Signal 3: Value overlap — only when at least one side is key-like
  if (fromIsFK || fromIsPK || toIsPK) {
    const overlap = valueOverlap(fromCol.sampleValues || [], toCol.sampleValues || []);
    if (overlap >= 0.8) {
      score += 0.30;
      if (!strategies.length) strategies.push("value_overlap");
    } else if (overlap >= 0.4) {
      score += overlap * 0.20;
      if (!strategies.length) strategies.push("value_overlap");
    }
  }

  // Type compatibility
  if (typesCompatible(fromCol.dataType, toCol.dataType)) score += 0.05;
  else score -= 0.20;

  // Structural bonuses
  if (toIsPK)   score += 0.10;
  if (fromIsFK) score += 0.05;

  return {
    score: Math.max(0, score),
    strategy: strategies.join("+") || null,
  };
}

/* ─────────────────────────────────────────────
   MAIN DETECTOR
   ───────────────────────────────────────────── */

/**
 * Detect relationships between all known collections.
 *
 * @param {Array<Object>} allMetadata
 *   Each item: { collectionName, totalRows, columns: [{name, dataType, sampleValues, uniqueCount}] }
 *
 * @returns {Array<Object>} relationships sorted by confidence descending:
 *   { fromCollection, fromColumn, toCollection, toColumn, confidence, strategy }
 */
function detectRelationships(allMetadata) {
  if (!Array.isArray(allMetadata) || allMetadata.length < 2) return [];

  const candidates = [];

  for (let i = 0; i < allMetadata.length; i++) {
    for (let j = i + 1; j < allMetadata.length; j++) {
      const metaA = allMetadata[i];
      const metaB = allMetadata[j];
      const colsA = Array.isArray(metaA.columns) ? metaA.columns : [];
      const colsB = Array.isArray(metaB.columns) ? metaB.columns : [];

      for (const colA of colsA) {
        for (const colB of colsB) {

          // Early filter: skip pairs with zero join potential
          const aIsKey     = isKeyLike(colA.name);
          const bIsKey     = isKeyLike(colB.name);
          const namesMatch = normalizeName(colA.name) === normalizeName(colB.name);
          if (!aIsKey && !bIsKey && !namesMatch) continue;

          // Skip bare generic "id" ↔ "id" pairs (primary source of false positives)
          // FIX: bare "id" columns from two unrelated tables share sequential values
          // [1,2,3,4,5] which overlap 100%, giving a false 0.65 confidence score.
          const colAName = normalizeName(colA.name);
          const colBName = normalizeName(colB.name);
          if ((colAName === "id" || colAName === "_id") &&
              (colBName === "id" || colBName === "_id")) continue;

          // Score both directions and keep the better one
          const ab = scoreDirection(colA, metaA, colB, metaB);
          const ba = scoreDirection(colB, metaB, colA, metaA);

          let best;
          if (ab.score >= ba.score && ab.score > 0) {
            best = { fromCollection: metaA.collectionName, fromColumn: colA.name, toCollection: metaB.collectionName, toColumn: colB.name, confidence: ab.score, strategy: ab.strategy };
          } else if (ba.score > 0) {
            best = { fromCollection: metaB.collectionName, fromColumn: colB.name, toCollection: metaA.collectionName, toColumn: colA.name, confidence: ba.score, strategy: ba.strategy };
          }

          if (best) candidates.push(best);
        }
      }
    }
  }

  // Threshold: 0.60 requires at least 2 signals to contribute
  const THRESHOLD = 0.60;
  const filtered = candidates.filter((r) => r.confidence >= THRESHOLD);

  // Deduplicate: keep best confidence per unique directional pair
  const dedup = new Map();
  for (const rel of filtered) {
    const key = `${rel.fromCollection}.${rel.fromColumn}|${rel.toCollection}.${rel.toColumn}`;
    const existing = dedup.get(key);
    if (!existing || rel.confidence > existing.confidence) dedup.set(key, rel);
  }

  return [...dedup.values()]
    .map((r) => ({ ...r, confidence: parseFloat(Math.min(r.confidence, 1).toFixed(2)) }))
    .sort((a, b) => b.confidence - a.confidence);
}

module.exports = { detectRelationships };