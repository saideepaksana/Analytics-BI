// src/api/dashboard/dashboardMapper.js
/**
 * Bidirectional mapper for Dashboard state.
 * Stores raw frontend state optionally for lossless round‑trip.
 */

function toDB(frontendState = {}) {
  const {
    title,
    description,
    tags,
    isFavorite,
    status,
    layout,
    chartRefs,
    filters,
    metadata,
    _rawFrontendState,
    // any additional fields are captured in rawState (by controller)
  } = frontendState;

  const dbObj = {
    ...(title !== undefined ? { title: title || 'Untitled Dashboard' } : {}),
    ...(description !== undefined ? { description: description || '' } : {}),
    ...(tags !== undefined ? { tags: Array.isArray(tags) ? tags : [] } : {}),
    ...(isFavorite !== undefined ? { isFavorite: !!isFavorite } : {}),
    ...(status !== undefined ? { status: status || 'draft' } : {}),
    ...(layout !== undefined ? { layout: layout || [] } : {}),
    ...(chartRefs !== undefined ? { chartRefs: Array.isArray(chartRefs) ? chartRefs : [] } : {}),
    ...(filters !== undefined ? { filters: filters && typeof filters === 'object' ? filters : {} } : {}),
    ...(metadata !== undefined ? { metadata: metadata && typeof metadata === 'object' ? metadata : {} } : {}),
  };

  if (_rawFrontendState !== undefined) {
    dbObj._rawFrontendState = _rawFrontendState;
  }

  return dbObj;
}

function fromDB(dbDoc = {}) {
  if (!dbDoc) return null;

  // Prefer normalized fields. Raw is fallback only.
  const normalized = {
    title: dbDoc.title,
    description: dbDoc.description,
    tags: dbDoc.tags,
    isFavorite: dbDoc.isFavorite,
    status: dbDoc.status,
    layout: dbDoc.layout,
    chartRefs: dbDoc.chartRefs,
    filters: dbDoc.filters,
    metadata: dbDoc.metadata,
    __v: dbDoc.__v,
    _id: dbDoc._id?.toString(),
    updatedAt: dbDoc.updatedAt,
    createdAt: dbDoc.createdAt,
  };

  if (dbDoc._rawFrontendState) {
    return {
      ...dbDoc._rawFrontendState,
      ...normalized,
    };
  }

  return normalized;
}

module.exports = { toDB, fromDB };
