const mongoose = require('mongoose');
const crypto = require('crypto');
const Annotation = require('../../models/Annotation');
const Chart = require('../../models/Chart');
const Dashboard = require('../../models/Dashboard');
const logger = require('../../core/logger');

/**
 * Validates that the referenced chartId or dashboardId actually exists.
 */
async function validateReference({ chartId, dashboardId }) {
  if (chartId) {
    const exists = await Chart.exists({ chartId: chartId });
    if (!exists) throw Object.assign(new Error('Referenced chart does not exist'), { status: 404 });
  }
  if (dashboardId) {
    const exists = await Dashboard.exists({ _id: dashboardId });
    if (!exists)
      throw Object.assign(new Error('Referenced dashboard does not exist'), { status: 404 });
  }
}

/**
 * Validates annotation position — both x and y must be 0-100 percentages.
 */
function validatePosition(position = {}) {
  const { x, y } = position;
  if (typeof x !== 'number' || x < 0 || x > 100 || typeof y !== 'number' || y < 0 || y > 100) {
    throw Object.assign(
      new Error('position.x and position.y must be numbers between 0 and 100 (relative %)'),
      { status: 400 }
    );
  }
}

/** Shared error handler */
function handleError(res, error) {
  logger.error(error.message, 'AnnotationsController');
  return res.status(error.status || 500).json({ message: error.message || 'Internal server error' });
}

function getActorId(req) {
  if (req.user?.id) return req.user.id;

  // Unauthenticated mode: derive a stable per-client identifier so anonymous users
  // cannot modify each other's annotations.
  const ip = String(req.ip || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ua = String(req.headers['user-agent'] || '');
  if (!ip && !ua) return 'anonymous';

  const hash = crypto
    .createHash('sha256')
    .update(`${ip}::${ua}`)
    .digest('hex')
    .slice(0, 24);
  return `anon:${hash}`;
}

function assertCanMutate({ actorId, annotation }) {
  if (!actorId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  if (annotation.authorId !== actorId) {
    throw Object.assign(new Error('Forbidden: only the author can modify this annotation'), {
      status: 403,
    });
  }
}

// ─── READ ──────────────────────────────────────────────────────────────────

/**
 * GET /api/annotations/chart/:chartId
 * Returns all annotations for a specific chart, most recent first.
 */
exports.getAnnotationsByChart = async (req, res) => {
  try {
    const { chartId } = req.params;
    if (!chartId)
      return res.status(400).json({ message: 'chartId is required' });

    const annotations = await Annotation.find({ chartId }).sort({ createdAt: -1 }).lean();
    return res.json({ annotations });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * GET /api/annotations/dashboard/:dashboardId
 * Returns all annotations for a dashboard (both direct dashboard annotations
 * and those on charts that belong to the dashboard).
 */
exports.getAnnotationsByDashboard = async (req, res) => {
  try {
    const { dashboardId } = req.params;
    if (!mongoose.isValidObjectId(dashboardId))
      return res.status(400).json({ message: 'Invalid dashboardId' });

    const annotations = await Annotation.find({ dashboardId }).sort({ createdAt: -1 }).lean();
    return res.json({ annotations });
  } catch (error) {
    return handleError(res, error);
  }
};

// ─── CREATE ────────────────────────────────────────────────────────────────

/**
 * POST /api/annotations
 * Body: { chartId?, dashboardId?, text, position: { x, y }, style? }
 * At least one of chartId or dashboardId must be provided.
 */
exports.createAnnotation = async (req, res) => {
  try {
    const { chartId, dashboardId, text, position, style } = req.body;
    const authorId = getActorId(req);

    // Validation
    if (!chartId && !dashboardId) {
      return res.status(400).json({ message: 'At least one of chartId or dashboardId is required' });
    }
    if (!text || !String(text).trim()) {
      return res.status(400).json({ message: 'text is required and must be non-empty' });
    }
    if (!position) {
      return res.status(400).json({ message: 'position is required' });
    }
    validatePosition(position);
    await validateReference({ chartId, dashboardId });

    const annotation = await Annotation.create({
      chartId: chartId || undefined,
      dashboardId: dashboardId || undefined,
      text: String(text).trim(),
      position,
      authorId,
      style: style || {},
    });

    return res.status(201).json({ annotation });
  } catch (error) {
    return handleError(res, error);
  }
};

// ─── UPDATE ────────────────────────────────────────────────────────────────

/**
 * PUT /api/annotations/:id
 * Replaces text, position, and style of an existing annotation.
 */
exports.updateAnnotation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ message: 'Invalid annotation id' });

    const { text, position, style } = req.body;
    const actorId = getActorId(req);

    if (text !== undefined && !String(text).trim()) {
      return res.status(400).json({ message: 'text must be non-empty' });
    }
    if (position !== undefined) validatePosition(position);

    const updateFields = {};
    if (text !== undefined) updateFields.text = String(text).trim();
    if (position !== undefined) updateFields.position = position;
    if (style !== undefined) updateFields.style = style;

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update (text, position, style)' });
    }

    const existing = await Annotation.findById(id).lean();
    if (!existing) return res.status(404).json({ message: 'Annotation not found' });
    assertCanMutate({ actorId, annotation: existing });

    const annotation = await Annotation.findByIdAndUpdate(id, { $set: updateFields }, { returnDocument: 'after', runValidators: true }).lean();

    return res.json({ annotation });
  } catch (error) {
    return handleError(res, error);
  }
};

// ─── DELETE ────────────────────────────────────────────────────────────────

/**
 * DELETE /api/annotations/:id
 */
exports.deleteAnnotation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ message: 'Invalid annotation id' });

    const actorId = getActorId(req);
    const existing = await Annotation.findById(id).lean();
    if (!existing) return res.status(404).json({ message: 'Annotation not found' });
    assertCanMutate({ actorId, annotation: existing });

    await Annotation.findByIdAndDelete(id);
    return res.json({ message: 'Annotation deleted' });
  } catch (error) {
    return handleError(res, error);
  }
};
