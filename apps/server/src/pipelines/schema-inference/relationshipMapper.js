/**
 * relationshipMapper.js
 * 
 * REQ-2.5: The system shall automatically link related data tables together
 * so that the Visualization wizard has all the information it needs for complex charts.
 * 
 * HOW IT WORKS:
 * Strategy 1 — Exact name match:   If collection A has "customer_id" and collection B
 *                                   also has "customer_id", they're likely joinable.
 * Strategy 2 — FK pattern match:   If collection A has "customer_id" and collection B
 *                                   has "_id" (or "id"), and "customer" appears in B's name.
 * Strategy 3 — Value overlap:      Sample values from both columns and check if they
 *                                   overlap significantly (>30% match = likely a join).
 */

/**
 * Normalize a column name for comparison.
 * e.g. "Customer_ID" → "customer_id", "customerId" → "customerid"
 */
function normalizeColName(name) {
  return name
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1_$2") // camelCase → snake_case
    .replace(/[-\s]/g, "_");              // spaces/dashes → underscores
}

/**
 * Strip common FK suffixes to get the "base entity" name.
 * e.g. "customer_id" → "customer", "product_code" → "product"
 */
function extractEntityName(colName) {
  const normalized = normalizeColName(colName);
  return normalized
    .replace(/_id$/, "")
    .replace(/_code$/, "")
    .replace(/_key$/, "")
    .replace(/_ref$/, "")
    .replace(/_no$/, "");
}

/**
 * Check value overlap between two sets of sample values.
 * Returns a ratio between 0 (no overlap) and 1 (full overlap).
 */
function computeValueOverlap(valuesA, valuesB) {
  if (!valuesA.length || !valuesB.length) return 0;

  const setA = new Set(valuesA.map(String));
  const setB = new Set(valuesB.map(String));

  let matchCount = 0;
  for (const val of setA) {
    if (setB.has(val)) matchCount++;
  }

  return matchCount / Math.min(setA.size, setB.size);
}

/**
 * Detect relationships between all known collections.
 * 
 * @param {Array<Object>} allMetadata - Array of { collectionName, columns, sampleDocs }
 *   Each item has:
 *     collectionName: string
 *     columns: [{ name, role, dataType, sampleValues }]
 *     sampleDocs: Array of raw MongoDB documents (for value overlap check)
 * 
 * @returns {Array<Object>} Array of detected relationships:
 *   { fromCollection, fromColumn, toCollection, toColumn, confidence, strategy }
 */
function detectRelationships(allMetadata) {
  const relationships = [];
  const seen = new Set(); // avoid duplicate A→B and B→A pairs

  for (let i = 0; i < allMetadata.length; i++) {
    for (let j = i + 1; j < allMetadata.length; j++) {
      const collA = allMetadata[i];
      const collB = allMetadata[j];

      for (const colA of collA.columns) {
        for (const colB of collB.columns) {
          const normA = normalizeColName(colA.name);
          const normB = normalizeColName(colB.name);

          // Dedup key
          const pairKey = [
            collA.collectionName, colA.name,
            collB.collectionName, colB.name,
          ]
            .sort()
            .join("|");

          if (seen.has(pairKey)) continue;

          let confidence = 0;
          let strategy = null;

          // --- Strategy 1: Exact column name match ---
          if (normA === normB && normA !== "id" && normA !== "_id") {
            confidence = 0.85;
            strategy = "exact_name_match";
          }

          // --- Strategy 2: FK pattern ---
          // e.g. colA = "customer_id" and collB name contains "customer"
          // OR   colB = "customer_id" and collA name contains "customer"
          if (!strategy) {
            const entityFromA = extractEntityName(colA.name);
            const entityFromB = extractEntityName(colB.name);

            const collBNameLower = collB.collectionName.toLowerCase();
            const collANameLower = collA.collectionName.toLowerCase();

            const aIsFKtoB =
              (normA.endsWith("_id") || normA.endsWith("_code")) &&
              collBNameLower.includes(entityFromA);

            const bIsFKtoA =
              (normB.endsWith("_id") || normB.endsWith("_code")) &&
              collANameLower.includes(entityFromB);

            if (aIsFKtoB) {
              confidence = 0.8;
              strategy = "fk_pattern";
            } else if (bIsFKtoA) {
              confidence = 0.8;
              strategy = "fk_pattern";
            }
          }

          // --- Strategy 3: Value overlap (most expensive, run only if types match) ---
          if (!strategy && colA.dataType === colB.dataType) {
            const overlap = computeValueOverlap(
              colA.sampleValues || [],
              colB.sampleValues || []
            );
            if (overlap >= 0.3) {
              confidence = Math.min(0.5 + overlap * 0.4, 0.75); // scale 0.5-0.75
              strategy = "value_overlap";
            }
          }

          // Only record if we found a meaningful relationship
          if (strategy && confidence >= 0.5) {
            seen.add(pairKey);
            relationships.push({
              fromCollection: collA.collectionName,
              fromColumn: colA.name,
              toCollection: collB.collectionName,
              toColumn: colB.name,
              confidence: parseFloat(confidence.toFixed(2)),
              strategy, // stored for debugging, not exposed to frontend
            });
          }
        }
      }
    }
  }

  // Sort by confidence descending
  return relationships.sort((a, b) => b.confidence - a.confidence);
}

module.exports = { detectRelationships };