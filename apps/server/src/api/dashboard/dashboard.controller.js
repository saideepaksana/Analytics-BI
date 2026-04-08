const Dashboard = require('../../models/Dashboard');
const dashboardMapper = require('./dashboardMapper');
const SchemaValidator = require('../../core/SchemaValidator');
const dashboardStateSchema = require('./dashboardState.schema');

/** GET /api/dashboards */
exports.listDashboards = async (req, res) => {
  try {
    const dashboards = await Dashboard.find().sort({ updatedAt: -1 }).lean();
    return res.json({ dashboards: dashboards.map(dashboardMapper.fromDB) });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/** POST /api/dashboards */
exports.createDashboard = async (req, res) => {
  try {
    const { title = 'New Dashboard', description = '', tags = [], layout = [] } = req.body;
    const dashboard = await Dashboard.create({
      title,
      description,
      tags,
      layout,
      createdBy: req.user?.id || 'anonymous',
    });
    return res.status(201).json({ dashboard: dashboardMapper.fromDB(dashboard.toJSON()) });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/** GET /api/dashboards/:dashboardId */
exports.getDashboard = async (req, res) => {
  try {
    const dashboard = await Dashboard.findById(req.params.dashboardId).lean();
    if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });
    return res.json({ dashboard: dashboardMapper.fromDB(dashboard) });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/** DELETE /api/dashboards/:dashboardId */
exports.deleteDashboard = async (req, res) => {
  try {
    const deleted = await Dashboard.findByIdAndDelete(req.params.dashboardId);
    if (!deleted) return res.status(404).json({ message: 'Dashboard not found' });
    return res.json({ message: 'Dashboard deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/** PATCH /api/dashboards/:dashboardId/layout
 *  Legacy endpoint - kept for compatibility. */
exports.saveDashboardLayout = async (req, res) => {
  try {
    const { layout } = req.body;
    if (!Array.isArray(layout)) return res.status(400).json({ message: 'layout must be an array' });
    const dashboard = await Dashboard.findByIdAndUpdate(
      req.params.dashboardId,
      { $set: { layout, updatedBy: req.user?.id || 'anonymous' }, $inc: { __v: 1 } },
      { new: true, runValidators: false }
    ).lean();
    if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });
    return res.json({ dashboard: dashboardMapper.fromDB(dashboard) });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const ALLOWED_METADATA_FIELDS = new Set(['title', 'description', 'tags', 'isFavorite', 'status']);
const ALLOWED_STATUS_VALUES = new Set(['draft', 'published']);

/** PATCH /api/dashboards/:dashboardId/metadata */
exports.patchDashboardMetadata = async (req, res) => {
  try {
    const { dashboardId } = req.params;
    const updates = req.body || {};
    const setObj = {};

    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_METADATA_FIELDS.has(key)) continue;

      if (key === 'tags') {
        setObj.tags = Array.isArray(value)
          ? value.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        continue;
      }

      if (key === 'title' || key === 'description' || key === 'status') {
        const normalizedValue = String(value || '').trim();
        if (key === 'status' && !ALLOWED_STATUS_VALUES.has(normalizedValue)) {
          return res.status(400).json({
            message: 'Invalid status value',
            allowedValues: Array.from(ALLOWED_STATUS_VALUES),
          });
        }
        setObj[key] = normalizedValue;
        continue;
      }

      setObj[key] = value;
    }

    if (Object.keys(setObj).length === 0) {
      return res.status(400).json({
        message: 'No valid metadata fields provided',
        allowedFields: Array.from(ALLOWED_METADATA_FIELDS),
      });
    }

    setObj.updatedBy = req.user?.id || 'anonymous';

    const dashboard = await Dashboard.findByIdAndUpdate(
      dashboardId,
      { $set: setObj, $inc: { __v: 1 } },
      { new: true, runValidators: true }
    ).lean();

    if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });
    return res.json({ message: 'Dashboard metadata updated', dashboard: dashboardMapper.fromDB(dashboard) });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * PATCH /api/dashboards/:dashboardId
 *
 * Auto‑save endpoint.  Accepts a partial dashboard state payload and
 * persists it atomically using optimistic concurrency control.
 *
 * Body:
 *   {
 *     __v: <number>,          // current client version (required for OCC)
 *     dashboardState: {       // fields to merge/update
 *       layout, filters, title, chartRefs, ...
 *     }
 *   }
 *
 * Responds 409 when the server version does not match `__v`,
 * indicating another autosave already wrote a newer version.
 */
exports.patchDashboardState = async (req, res) => {
  try {
    const { dashboardId } = req.params;
    const validation = SchemaValidator.validate(dashboardStateSchema, req.body || {});
    if (!validation.valid) {
      return res.status(400).json({ message: 'Invalid dashboard autosave payload', errors: validation.errors });
    }

    // Normalize: new contract can send `version`, legacy sends `__v` + `dashboardState`
    const clientVersion =
      typeof req.body.version === 'number' ? req.body.version : req.body.__v;

    const incomingState =
      req.body.dashboardState && typeof req.body.dashboardState === 'object'
        ? req.body.dashboardState
        : req.body;

    if (typeof clientVersion !== 'number') {
      return res.status(400).json({ message: 'Missing version/__v for concurrency control' });
    }

    // Map frontend state -> DB normalized updates
    const mapped = dashboardMapper.toDB(incomingState);

    // Only allow a safe subset to be updated via autosave
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
    } = mapped;

    // Only persist raw frontend state when explicitly provided by the client.
    // To avoid divergence with normalized fields, strip keys that are stored separately.
    let rawSnapshot;
    if (incomingState && typeof incomingState === 'object' && Object.prototype.hasOwnProperty.call(incomingState, '_rawFrontendState')) {
      rawSnapshot = incomingState._rawFrontendState;
    } else if (incomingState && typeof incomingState === 'object' && _rawFrontendState !== undefined) {
      rawSnapshot = _rawFrontendState;
    }

    let prunedRawSnapshot;
    if (rawSnapshot && typeof rawSnapshot === 'object' && !Array.isArray(rawSnapshot)) {
      prunedRawSnapshot = { ...rawSnapshot };
      for (const key of [
        '_id',
        '__v',
        'version',
        'title',
        'description',
        'tags',
        'isFavorite',
        'status',
        'layout',
        'chartRefs',
        'filters',
        'metadata',
        'updatedAt',
        'createdAt',
      ]) {
        delete prunedRawSnapshot[key];
      }
      if (Object.keys(prunedRawSnapshot).length === 0) prunedRawSnapshot = null;
    }

    const safeUpdates = {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(isFavorite !== undefined ? { isFavorite } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(layout !== undefined ? { layout } : {}),
      ...(chartRefs !== undefined ? { chartRefs } : {}),
      ...(filters !== undefined ? { filters } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
      ...(prunedRawSnapshot !== undefined ? { _rawFrontendState: prunedRawSnapshot } : {}),
      updatedAt: new Date(),
    };

    const dashboard = await Dashboard.findOneAndUpdate(
      { _id: dashboardId, __v: clientVersion },
      {
        $set: { ...safeUpdates, updatedBy: req.user?.id || 'anonymous' },
        $inc: { __v: 1 },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!dashboard) {
      // Either not found or version mismatch – treat both as conflict to be safe
      const exists = await Dashboard.exists({ _id: dashboardId });
      if (!exists) return res.status(404).json({ message: 'Dashboard not found' });
      return res.status(409).json({
        message: 'Conflict: dashboard version mismatch. Re-fetch and retry.',
      });
    }

    return res.json({ dashboard: dashboardMapper.fromDB(dashboard) });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error', detail: error.message });
  }
};
