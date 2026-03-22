/**
 * relationshipMapper.js
 *
 * Goal:
 * -----
 * Detect likely relationships between collections so the visualization layer
 * can infer joins automatically.
 * Approach:
 * - prefers clear FK → PK direction
 * - avoids ambiguous matches
 * - uses name signals, uniqueness, type compatibility, and value overlap
 */

/* =========================
   Name Normalization Helpers
   ========================= */

// Normalize names for comparison.
// Handles camelCase, snake_case, kebab-case, spaces, and punctuation.
function normalizeName(name) {
    return String(name || "")
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")   // camelCase -> snake_case
        .replace(/[^a-zA-Z0-9]+/g, "_")           // separators -> _
        .toLowerCase()
        .replace(/^_+|_+$/g, "");
}

// Split name into comparable tokens.
function tokenizeName(name) {
    return normalizeName(name)
        .split("_")
        .filter(Boolean);
}

// Remove common FK suffixes to get the base entity name.
function extractBaseEntity(name) {
    const normalized = normalizeName(name);
    return normalized
        .replace(/(_id|_code|_key|_ref|_no|_num)$/, "")
        .replace(/^fk_/, "")
        .replace(/^ref_/, "");
}

// Extract a clean set of sample values.
function normalizeValues(values) {
    return (values || [])
        .filter((v) => v !== null && v !== undefined && v !== "")
        .map((v) => String(v).trim())
        .filter(Boolean);
}

/* =========================
   Relationship Heuristics
   ========================= */

const KEY_SUFFIXES = ["_id", "_code", "_key", "_ref", "_no", "_num"];

// Columns with these names are usually join candidates.
function looksKeyLike(columnName) {
    const normalized = normalizeName(columnName);
    return (
        normalized === "id" ||
        normalized === "_id" ||
        KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
    );
}

// Very likely primary key if the column is key-like and mostly unique.
function looksLikePrimaryKey(col, rowCount, sampleSize) {
    const uniqueCount = col.uniqueCount ?? 0;
    const base = Math.max(rowCount || 0, sampleSize || 1, 1);
    const uniquenessRatio = uniqueCount / base;

    return looksKeyLike(col.name) && uniquenessRatio >= 0.9;
}

// Likely foreign key if it looks key-like but is not highly unique.
function looksLikeForeignKey(col, rowCount, sampleSize) {
    const uniqueCount = col.uniqueCount ?? 0;
    const base = Math.max(rowCount || 0, sampleSize || 1, 1);
    const uniquenessRatio = uniqueCount / base;

    return looksKeyLike(col.name) && uniquenessRatio < 0.9;
}

// Basic type compatibility check for joins.
function isCompatibleType(typeA, typeB) {
    const a = String(typeA || "").toLowerCase();
    const b = String(typeB || "").toLowerCase();

    if (!a || !b) return true;
    if (a === b) return true;

    // Allow common join-like coercions.
    const numericLike = new Set(["number", "int", "integer", "float", "double", "decimal"]);
    const stringLike = new Set(["string", "text", "varchar", "char"]);

    if ((numericLike.has(a) && stringLike.has(b)) || (numericLike.has(b) && stringLike.has(a))) {
        return true;
    }

    return false;
}

// Jaccard-style overlap on sampled values.
function computeValueOverlap(valuesA, valuesB) {
    const setA = new Set(normalizeValues(valuesA));
    const setB = new Set(normalizeValues(valuesB));

    if (setA.size === 0 || setB.size === 0) return 0;

    let matchCount = 0;
    for (const val of setA) {
        if (setB.has(val)) matchCount++;
    }

    // Normalize by smaller side so subset overlap is rewarded.
    return matchCount / Math.min(setA.size, setB.size);
}

// Compare the base entity in a FK-like column to a collection name.
function collectionMatchesBaseName(collectionName, baseEntity) {
    const collectionTokens = tokenizeName(collectionName);
    const baseTokens = tokenizeName(baseEntity);

    if (baseTokens.length === 0) return false;

    // Direct substring match is the strongest signal.
    const collectionNorm = normalizeName(collectionName);
    const baseNorm = normalizeName(baseEntity);

    if (collectionNorm.includes(baseNorm) || baseNorm.includes(collectionNorm)) {
        return true;
    }

    // Token overlap is a softer signal.
    return baseTokens.some((t) => collectionTokens.includes(t));
}

/* =========================
   Scoring
   ========================= */

function scoreCandidate({
    fromCol,
    toCol,
    fromMeta,
    toMeta,
    fromValues,
    toValues,
}) {
    let score = 0;
    let strategy = null;

    const fromRowCount = fromMeta.rowCount || fromMeta.totalRows || 0;
    const toRowCount = toMeta.rowCount || toMeta.totalRows || 0;

    const fromPK = looksLikePrimaryKey(fromCol, fromRowCount, fromValues.length);
    const toPK = looksLikePrimaryKey(toCol, toRowCount, toValues.length);
    const fromFK = looksLikeForeignKey(fromCol, fromRowCount, fromValues.length);
    const toFK = looksLikeForeignKey(toCol, toRowCount, toValues.length);

    const fromNorm = normalizeName(fromCol.name);
    const toNorm = normalizeName(toCol.name);

    // 1) Exact same column name.
    if (fromNorm === toNorm && fromNorm !== "id" && fromNorm !== "_id") {
        score += 0.35;
        strategy = "exact_name_match";
    }

    // 2) FK pattern match: from side looks like FK, to side looks like referenced collection/key.
    const fromBase = extractBaseEntity(fromCol.name);
    const toBase = extractBaseEntity(toCol.name);

    const fromToCollectionMatch =
        looksKeyLike(fromCol.name) &&
        (collectionMatchesBaseName(toMeta.collectionName, fromBase) ||
            collectionMatchesBaseName(toMeta.collectionName, fromNorm));

    const toFromCollectionMatch =
        looksKeyLike(toCol.name) &&
        (collectionMatchesBaseName(fromMeta.collectionName, toBase) ||
            collectionMatchesBaseName(fromMeta.collectionName, toNorm));

    if (!strategy && fromToCollectionMatch && fromFK && toPK) {
        score += 0.7;
        strategy = "fk_pattern";
    } else if (!strategy && toFromCollectionMatch && toFK && fromPK) {
        score += 0.7;
        strategy = "fk_pattern";
    }

    // 3) Value overlap helps when keys are sampled and names are not enough.
    const overlap = computeValueOverlap(fromValues, toValues);
    if (overlap >= 0.8) {
        score += 0.45;
        strategy = strategy || "value_overlap";
    } else if (overlap >= 0.3 && (fromFK || toFK || fromPK || toPK)) {
        score += 0.25;
        strategy = strategy || "value_overlap";
    }

    // 4) Type compatibility.
    if (isCompatibleType(fromCol.dataType, toCol.dataType)) {
        score += 0.1;
    } else {
        score -= 0.2;
    }

    // 5) Stronger confidence if the target side looks like a primary key.
    if (toPK) score += 0.15;
    if (fromPK) score -= 0.05;

    // 6) Prefer foreign-key-like source columns.
    if (fromFK) score += 0.1;
    if (toFK) score -= 0.05;

    return {
        score,
        strategy,
        overlap,
        fromPK,
        toPK,
        fromFK,
        toFK,
    };
}

/* =========================
   Main Detector
   ========================= */

function detectRelationships(allMetadata) {
    const relationships = [];

    if (!Array.isArray(allMetadata) || allMetadata.length < 2) {
        return relationships;
    }

    // Compare each pair of collections once.
    for (let i = 0; i < allMetadata.length; i++) {
        for (let j = i + 1; j < allMetadata.length; j++) {
            const collA = allMetadata[i];
            const collB = allMetadata[j];

            const colsA = Array.isArray(collA.columns) ? collA.columns : [];
            const colsB = Array.isArray(collB.columns) ? collB.columns : [];

            for (const colA of colsA) {
                for (const colB of colsB) {
                    // Prefer join columns only.
                    const aJoinCandidate = looksKeyLike(colA.name) || colA.role === "dimension";
                    const bJoinCandidate = looksKeyLike(colB.name) || colB.role === "dimension";
                    if (!aJoinCandidate && !bJoinCandidate) continue;

                    const valuesA = colA.sampleValues || [];
                    const valuesB = colB.sampleValues || [];

                    // Score A -> B
                    const scoreAB = scoreCandidate({
                        fromCol: colA,
                        toCol: colB,
                        fromMeta: collA,
                        toMeta: collB,
                        fromValues: valuesA,
                        toValues: valuesB,
                    });

                    // Score B -> A
                    const scoreBA = scoreCandidate({
                        fromCol: colB,
                        toCol: colA,
                        fromMeta: collB,
                        toMeta: collA,
                        fromValues: valuesB,
                        toValues: valuesA,
                    });

                    // Choose the stronger direction.
                    let best = null;
                    if (scoreAB.score > scoreBA.score) {
                        best = {
                            fromCollection: collA.collectionName,
                            fromColumn: colA.name,
                            toCollection: collB.collectionName,
                            toColumn: colB.name,
                            confidence: scoreAB.score,
                            strategy: scoreAB.strategy,
                        };
                    } else if (scoreBA.score > scoreAB.score) {
                        best = {
                            fromCollection: collB.collectionName,
                            fromColumn: colB.name,
                            toCollection: collA.collectionName,
                            toColumn: colA.name,
                            confidence: scoreBA.score,
                            strategy: scoreBA.strategy,
                        };
                    } else {
                        // Tie: only accept if one side is clearly FK-like and the other is PK-like.
                        const abClear = scoreAB.fromFK && scoreAB.toPK;
                        const baClear = scoreBA.fromFK && scoreBA.toPK;

                        if (abClear && !baClear) {
                            best = {
                                fromCollection: collA.collectionName,
                                fromColumn: colA.name,
                                toCollection: collB.collectionName,
                                toColumn: colB.name,
                                confidence: scoreAB.score,
                                strategy: scoreAB.strategy,
                            };
                        } else if (baClear && !abClear) {
                            best = {
                                fromCollection: collB.collectionName,
                                fromColumn: colB.name,
                                toCollection: collA.collectionName,
                                toColumn: colA.name,
                                confidence: scoreBA.score,
                                strategy: scoreBA.strategy,
                            };
                        }
                    }

                    // Conservative threshold to avoid noisy joins.
                    if (best && best.confidence >= 0.55) {
                        relationships.push({
                            ...best,
                            confidence: Number(Math.min(best.confidence, 1).toFixed(2)),
                        });
                    }
                }
            }
        }
    }

    // Remove duplicates and keep the best confidence for each pair.
    const dedup = new Map();
    for (const rel of relationships) {
        const key = [
            rel.fromCollection,
            rel.fromColumn,
            rel.toCollection,
            rel.toColumn,
        ].join("|");

        const existing = dedup.get(key);
        if (!existing || rel.confidence > existing.confidence) {
            dedup.set(key, rel);
        }
    }

    return [...dedup.values()].sort((a, b) => b.confidence - a.confidence);
}

module.exports = { detectRelationships };