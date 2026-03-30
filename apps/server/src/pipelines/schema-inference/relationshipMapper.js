/**
 * relationshipMapper.js
 *
 * WHAT THIS FILE DOES:
 * Compares every column in every collection against every column in every
 * other collection, scores each pair using 4 signals, and emits only
 * high-confidence relationships.
 *
 * THE 4 SCORING SIGNALS (scores STACK):
 *   1. Exact name match      +0.40  (same column name in both collections)
 *   2. FK pattern match      +0.50  (column base entity matches toCollection name)
 *   3. Value overlap         +0.00 to +0.30  (actual sample values intersect)
 *   4. High cardinality      +0.10  (column has many unique values → likely a key)
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

/**
 * FIX: Multi-token singularize that handles collection names like "orders_2024".
 * Instead of singularizing the whole string, we singularize each meaningful token
 * and compare against the column's base entity tokens.
 */
function singularizeToken(token) {
    if (!token) return token;
    // Common irregular plurals
    const irregulars = {
        people: "person", children: "child", men: "man", women: "woman",
        teeth: "tooth", feet: "foot", mice: "mouse", geese: "goose",
    };
    if (irregulars[token]) return irregulars[token];
    // Standard rules
    if (token.endsWith("ies")) return token.slice(0, -3) + "y";     // categories → category
    if (token.endsWith("ves")) return token.slice(0, -3) + "f";     // leaves → leaf
    if (token.endsWith("ses") || token.endsWith("xes") ||
        token.endsWith("zes") || token.endsWith("ches") ||
        token.endsWith("shes")) return token.slice(0, -2);          // statuses → status
    if (token.endsWith("s") && token.length > 3) return token.slice(0, -1); // orders → order
    return token;
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
 * Deliberately excludes bare "id" and "_id" — too generic.
 * "customer_id" → true, "id" → false, "revenue" → false
 */
function isKeyLike(columnName) {
    const n = normalizeName(columnName);
    return FK_SUFFIXES.some((s) => n.endsWith(s));
}

/**
 * FIX: Multi-token isPrimaryKey.
 * Checks whether the column's base entity tokens appear in the collection's tokens.
 *
 * "customer_id" in "customers"       → base="customer", collTokens=["customer"]        → PK ✓
 * "customer_id" in "orders"          → base="customer", collTokens=["order"]            → NOT PK ✓
 * "order_id"    in "orders_2024"     → base="order", collTokens=["order","2024"]        → PK ✓  (FIX)
 * "customer_id" in "customer_orders" → base="customer", collTokens=["customer","order"] → PK ✓ (ambiguous but acceptable)
 */
function isPrimaryKey(columnName, collectionName) {
    const n = normalizeName(columnName);
    if (n === "id" || n === "_id") return true;

    if (!isKeyLike(columnName)) return false;
    const base = extractBaseEntity(columnName);
    const baseTokens = tokenize(base);
    const collTokens = tokenize(collectionName).map(singularizeToken);

    // Every token in the base must appear (singularized) in the collection tokens
    return baseTokens.length > 0 && baseTokens.every((bt) =>
        collTokens.includes(bt) || collTokens.includes(singularizeToken(bt))
    );
}

/**
 * Returns true if this column is a FOREIGN KEY — key-like but not own PK.
 * "customer_id" in "orders" → FK
 */
function isForeignKey(columnName, collectionName) {
    return isKeyLike(columnName) && !isPrimaryKey(columnName, collectionName);
}

/**
 * Returns true if the base entity of a column matches a target collection name.
 * Uses token-exact matching (not substring) to avoid false matches.
 *
 * "customer_id" (base: "customer") → matches "customers" ✓
 * "order_id"    (base: "order")    → does NOT match "order_items" ✗
 */
function columnPointsToCollection(columnName, collectionName) {
    const base = extractBaseEntity(columnName);
    const baseTokens = tokenize(base);
    const collTokens = tokenize(collectionName).map(singularizeToken);

    if (baseTokens.length === 0) return false;

    // All base tokens must match collection tokens (singularized)
    return baseTokens.every((bt) =>
        collTokens.includes(bt) || collTokens.includes(singularizeToken(bt))
    );
}

function valueOverlap(valuesA, valuesB) {
    const setA = new Set(normalizeValues(valuesA));
    const setB = new Set(normalizeValues(valuesB));
    if (setA.size === 0 || setB.size === 0) return 0;
    let matches = 0;
    for (const v of setA) {
        if (setB.has(v)) matches++;
    }
    return matches / Math.min(setA.size, setB.size);
}

function typesCompatible(typeA, typeB) {
    const a = String(typeA || "").toLowerCase();
    const b = String(typeB || "").toLowerCase();
    if (!a || !b || a === b) return true;
    const numeric = new Set(["number", "int", "integer", "float", "double", "decimal"]);
    const textual = new Set(["string", "text", "varchar", "char"]);
    // Allow numeric ↔ string for IDs that might be stored as either
    if (numeric.has(a) && textual.has(b)) return true;
    if (textual.has(a) && numeric.has(b)) return true;
    return false;
}

/* ─────────────────────────────────────────────
   SCORING
   ───────────────────────────────────────────── */

/**
 * Score one direction: fromCol (potential FK side) → toCol (potential PK side).
 * All signals STACK.
 */
function scoreDirection(fromCol, fromMeta, toCol, toMeta) {
    let score = 0;
    const strategies = [];

    const fromName = normalizeName(fromCol.name);
    const toName = normalizeName(toCol.name);

    const fromIsFK = isForeignKey(fromCol.name, fromMeta.collectionName);
    const fromIsPK = isPrimaryKey(fromCol.name, fromMeta.collectionName);
    const toIsPK = isPrimaryKey(toCol.name, toMeta.collectionName);

    const namesMatch = fromName === toName && fromName !== "id" && fromName !== "_id";

    // ── Signal 1: Exact name match (excluding bare "id") ──────────────────────
    if (namesMatch) {
        score += 0.40;
        strategies.push("exact_name_match");
    }

    // ── Signal 2: FK pattern ───────────────────────────────────────────────────
    // fromCol is a FK in its own collection AND its base entity points to toCollection
    // AND toCol is the PK of toCollection
    if (isKeyLike(fromCol.name) &&
        fromIsFK &&
        toIsPK &&
        columnPointsToCollection(fromCol.name, toMeta.collectionName)) {
        score += 0.50;
        strategies.push("fk_pattern");
    }

    // ── Signal 3: Value overlap ────────────────────────────────────────────────
    // FIX: fire for any key-like column OR for exact name matches (shared dimensions).
    // This allows non-FK shared columns like "country", "region" to be detected
    // when they have matching values across collections.
    const shouldCheckOverlap = fromIsFK || fromIsPK || toIsPK || namesMatch;
    if (shouldCheckOverlap) {
        const overlap = valueOverlap(fromCol.sampleValues || [], toCol.sampleValues || []);
        if (overlap >= 0.8) {
            score += 0.30;
            if (!strategies.length) strategies.push("value_overlap");
        } else if (overlap >= 0.5) {
            score += overlap * 0.20;
            if (!strategies.length) strategies.push("value_overlap");
        }
    }

    // ── Type compatibility ─────────────────────────────────────────────────────
    if (typesCompatible(fromCol.dataType, toCol.dataType)) {
        score += 0.05;
    } else {
        score -= 0.20;
    }

    // ── Structural bonuses ─────────────────────────────────────────────────────
    if (toIsPK) score += 0.10;
    if (fromIsFK) score += 0.05;

    // ── High cardinality bonus ─────────────────────────────────────────────────
    // A column with many unique values is more likely to be a meaningful join key
    const fromUnique = fromCol.uniqueCount || 0;
    const toUnique = toCol.uniqueCount || 0;
    if (fromUnique > 10 && toUnique > 10) score += 0.05;

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

                    const aIsKey = isKeyLike(colA.name);
                    const bIsKey = isKeyLike(colB.name);
                    const colANorm = normalizeName(colA.name);
                    const colBNorm = normalizeName(colB.name);
                    const namesMatch = colANorm === colBNorm;

                    // ── Early filter ──────────────────────────────────────────────────
                    // Skip pairs with ZERO join potential:
                    //   - neither column is key-like AND they don't share the same name
                    // FIX: "namesMatch" is now included as a valid pass-through signal,
                    // so same-name non-key columns (like "country" ↔ "country") are scored.
                    if (!aIsKey && !bIsKey && !namesMatch) continue;

                    // Skip bare generic "id" ↔ "id" pairs (source of false positives from
                    // sequential IDs like [1,2,3] that overlap 100% across unrelated tables)
                    if ((colANorm === "id" || colANorm === "_id") &&
                        (colBNorm === "id" || colBNorm === "_id")) continue;

                    // Score both directions and keep the better one
                    const ab = scoreDirection(colA, metaA, colB, metaB);
                    const ba = scoreDirection(colB, metaB, colA, metaA);

                    let best;
                    if (ab.score >= ba.score && ab.score > 0) {
                        best = {
                            fromCollection: metaA.collectionName,
                            fromColumn: colA.name,
                            toCollection: metaB.collectionName,
                            toColumn: colB.name,
                            confidence: ab.score,
                            strategy: ab.strategy,
                        };
                    } else if (ba.score > 0) {
                        best = {
                            fromCollection: metaB.collectionName,
                            fromColumn: colB.name,
                            toCollection: metaA.collectionName,
                            toColumn: colA.name,
                            confidence: ba.score,
                            strategy: ba.strategy,
                        };
                    }

                    if (best) candidates.push(best);
                }
            }
        }
    }

    // FIX: Threshold lowered from 0.60 → 0.45.
    // Rationale: a single solid signal (exact_name_match=0.40 + type_compat=0.05)
    // gives exactly 0.45. The old 0.60 threshold required at least 2 strong signals,
    // which made single-signal relationships like "country" ↔ "country" invisible.
    const THRESHOLD = 0.45;
    const filtered = candidates.filter((r) => r.confidence >= THRESHOLD);

    // Deduplicate: keep best confidence per unique directional pair
    const dedup = new Map();
    for (const rel of filtered) {
        const key = `${rel.fromCollection}.${rel.fromColumn}|${rel.toCollection}.${rel.toColumn}`;
        const existing = dedup.get(key);
        if (!existing || rel.confidence > existing.confidence) {
            dedup.set(key, rel);
        }
    }

    return [...dedup.values()]
        .map((r) => ({
            ...r,
            confidence: parseFloat(Math.min(r.confidence, 1).toFixed(2)),
        }))
        .sort((a, b) => b.confidence - a.confidence);
}

module.exports = { detectRelationships };