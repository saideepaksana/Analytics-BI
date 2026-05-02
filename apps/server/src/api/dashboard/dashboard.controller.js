const Dashboard = require('../../models/Dashboard');
const dashboardMapper = require('./dashboardMapper');
const SchemaValidator = require('../../core/SchemaValidator');
const dashboardStateSchema = require('./dashboardState.schema');
const { loadDashboard, refreshDashboardCache } = require('./dashboardService');
const { isOwnerOrEditor } = require('../../middleware/rbac');

// Alias for readability within this controller
const canEditDashboard = isOwnerOrEditor;
const canDeleteDashboard = isOwnerOrEditor;

/** GET /api/dashboards */
exports.listDashboards = async (req, res) => {
    try {
        const user = req.user;
        let filter = {};
        
        // Admins can see everything; editors see published + their own drafts
        if (user && user.role === 'admin') {
            filter = {};
        } else if (user && user.role !== 'viewer') {
            // Show all published + user's own drafts
            filter = {
                $or: [
                    { status: 'published' },
                    { createdBy: user.id }
                ]
            };
        } else if (user) {
            // Viewers can only see published
            filter = { status: 'published' };
        } else {
            // Unauthenticated users see only published
            filter = { status: 'published' };
        }
        
        const dashboards = await Dashboard.find(filter).sort({ updatedAt: -1 }).lean();
        return res.json({ dashboards: dashboards.map(dashboardMapper.fromDB) });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/** POST /api/dashboards */
exports.createDashboard = async (req, res) => {
    try {
        const { title = 'New Dashboard', description = '', tags = [], layout = [], tabs = [], activeTabId = null, _rawFrontendState = null } = req.body;
        
        // Use mapper to ensure all fields are properly validated and saved
        const mappedData = dashboardMapper.toDB({
            title,
            description,
            tags,
            layout,
            tabs: Array.isArray(tabs) && tabs.length > 0 ? tabs : [],
            activeTabId,
            _rawFrontendState,
        });
        
        const dashboard = await Dashboard.create({
            ...mappedData,
            createdBy: req.user?.id || 'anonymous',
        });
        return res.status(201).json({ dashboard: dashboardMapper.fromDB(dashboard.toJSON()) });
    } catch (error) {
        console.error('Error creating dashboard:', error);
        return res.status(500).json({ message: 'Internal server error', detail: error.message });
    }
};

/** GET /api/dashboards/:dashboardId */
exports.getDashboard = async (req, res) => {
    try {
        const dashboard = await Dashboard.findById(req.params.dashboardId).lean();
        if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });

        // Hide draft dashboards from non-owners (return 404 to avoid enumeration)
        if (dashboard.status === 'draft' && !isOwnerOrEditor(dashboard, req.user)) {
            return res.status(404).json({ message: 'Dashboard not found' });
        }

        return res.json({ dashboard: dashboardMapper.fromDB(dashboard) });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/** DELETE /api/dashboards/:dashboardId */
exports.deleteDashboard = async (req, res) => {
    try {
        const dashboard = await Dashboard.findById(req.params.dashboardId).lean();
        if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });

        if (!canDeleteDashboard(dashboard, req.user)) {
            return res.status(403).json({ message: 'You do not have permission to delete this dashboard' });
        }

        await Dashboard.findByIdAndDelete(req.params.dashboardId);
        return res.json({ message: 'Dashboard deleted' });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/** PATCH /api/dashboards/:dashboardId/layout
 *  Legacy endpoint - kept for compatibility. */
exports.saveDashboardLayout = async (req, res) => {
    try {
        const dashboard = await Dashboard.findById(req.params.dashboardId).lean();
        if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });

        if (!canEditDashboard(dashboard, req.user)) {
            return res.status(403).json({ message: 'You do not have permission to edit this dashboard' });
        }

        const { layout } = req.body;
        if (!Array.isArray(layout)) return res.status(400).json({ message: 'layout must be an array' });
        const updatedDashboard = await Dashboard.findByIdAndUpdate(
            req.params.dashboardId,
            { $set: { layout, updatedBy: req.user?.id || 'anonymous' }, $inc: { __v: 1 } },
            { returnDocument: 'after', runValidators: false }
        ).lean();
        return res.json({ dashboard: dashboardMapper.fromDB(updatedDashboard) });
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
        const dashboard = await Dashboard.findById(dashboardId).lean();
        if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });

        if (!canEditDashboard(dashboard, req.user)) {
            return res.status(403).json({ message: 'You do not have permission to edit this dashboard' });
        }

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

        const updatedDashboard = await Dashboard.findByIdAndUpdate(
            dashboardId,
            { $set: setObj, $inc: { __v: 1 } },
            { returnDocument: 'after', runValidators: true }
        ).lean();

        return res.json({ message: 'Dashboard metadata updated', dashboard: dashboardMapper.fromDB(updatedDashboard) });
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
        const dashboard = await Dashboard.findById(dashboardId).lean();
        if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });

        if (!canEditDashboard(dashboard, req.user)) {
            return res.status(403).json({ message: 'You do not have permission to edit this dashboard' });
        }

        const validation = SchemaValidator.validate(dashboardStateSchema, req.body || {});
        if (!validation.valid) {
            return res.status(400).json({ message: 'Invalid dashboard autosave payload', errors: validation.errors });
        }

        const clientVersion = typeof req.body.version === 'number' ? req.body.version : req.body.__v;
        const incomingState = req.body.dashboardState && typeof req.body.dashboardState === 'object' ? req.body.dashboardState : req.body;

        if (typeof clientVersion !== 'number') {
            return res.status(400).json({ message: 'Missing version/__v for concurrency control' });
        }

        const mapped = dashboardMapper.toDB(incomingState);
        const { layout, tabs } = mapped;

        // Optionally validate flat layout if provided
        if (layout && layout.length > 0) {
            const layoutError = validateLayout(layout);
            if (layoutError) return res.status(400).json({ message: 'Invalid layout', detail: layoutError });
        }

        if (tabs && tabs.length > 0) {
            for (const tab of tabs) {
                if (tab.widgets) {
                    const layoutError = validateLayout(tab.widgets);
                    if (layoutError) return res.status(400).json({ message: `Invalid layout in tab ${tab.name}`, detail: layoutError });
                }
            }
        }

        const updatedDashboard = await Dashboard.findOneAndUpdate(
            { _id: dashboardId, __v: clientVersion },
            { $set: { ...mapped, updatedBy: req.user?.id || 'anonymous' }, $inc: { __v: 1 } },
            { returnDocument: 'after', runValidators: true }
        ).lean();

        if (!updatedDashboard) return res.status(409).json({ message: 'Conflict: dashboard version mismatch.' });
        return res.json({ dashboard: dashboardMapper.fromDB(updatedDashboard) });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error', detail: error.message });
    }
};

function validateLayout(layout) {
    if (!Array.isArray(layout)) return 'Layout must be an array';
    for (let i = 0; i < layout.length; i++) {
        const a = layout[i];
        if (a.x < 0 || a.y < 0 || a.w <= 0 || a.h <= 0) return `Widget ${a.id || i} has invalid dimensions`;
        for (let j = i + 1; j < layout.length; j++) {
            const b = layout[j];
            const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
            if (overlap) return `Collision detected between widget ${a.id || i} and ${b.id || j}`;
        }
    }
    return null;
}

/** GET /api/dashboards/:dashboardId/full */
exports.getDashboardFull = async (req, res) => {
    try {
        const { dashboardId } = req.params;
        const fullDashboard = await loadDashboard(dashboardId);
        return res.json({ dashboard: dashboardMapper.fromDB(fullDashboard) });
    } catch (error) {
        if (error.message === 'Dashboard not found') {
            return res.status(404).json({ message: 'Dashboard not found' });
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/** POST /api/dashboards/:dashboardId/refresh */
exports.refreshDashboard = async (req, res) => {
    try {
        const { dashboardId } = req.params;
        await refreshDashboardCache(dashboardId);
        return res.json({ message: 'Dashboard cache refreshed' });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/** POST /api/dashboards/:dashboardId/publish
 * Publish a draft dashboard to make it live for all users */
exports.publishDashboard = async (req, res) => {
    try {
        const { dashboardId } = req.params;
        const dashboard = await Dashboard.findById(dashboardId).lean();
        if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });

        if (!canEditDashboard(dashboard, req.user)) {
            return res.status(403).json({ message: 'You do not have permission to publish this dashboard' });
        }

        // If there's draft state, promote it to live
        const updateData = {
            status: 'published',
            publishedAt: new Date(),
            publishedBy: req.user?.id || 'anonymous',
            version: (dashboard.version || 0) + 1,
            updatedBy: req.user?.id || 'anonymous'
        };

        // If there's draft state, copy it to live
        if (dashboard.draftState && typeof dashboard.draftState === 'object') {
            const normalizedDraft = { ...dashboard.draftState };
            if (normalizedDraft.name && !normalizedDraft.title) {
                normalizedDraft.title = normalizedDraft.name;
            }
            const mappedDraft = dashboardMapper.toDB(normalizedDraft);
            Object.assign(updateData, mappedDraft, {
                _rawFrontendState: normalizedDraft,
                draftState: null, // Clear draft after publishing
            });
        }

        const updatedDashboard = await Dashboard.findByIdAndUpdate(
            dashboardId,
            { $set: updateData, $inc: { __v: 1 } },
            { returnDocument: 'after', runValidators: true }
        ).lean();

        return res.json({ 
            message: 'Dashboard published successfully', 
            dashboard: dashboardMapper.fromDB(updatedDashboard) 
        });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error', detail: error.message });
    }
};

/** POST /api/dashboards/:dashboardId/unpublish
 * Unpublish a dashboard (revert to draft)
 * Preserves the current live state as a draft snapshot so no edits are lost. */
exports.unpublishDashboard = async (req, res) => {
    try {
        const { dashboardId } = req.params;
        const dashboard = await Dashboard.findById(dashboardId).lean();
        if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });

        if (!canEditDashboard(dashboard, req.user)) {
            return res.status(403).json({ message: 'You do not have permission to unpublish this dashboard' });
        }

        // Snapshot the live layout/tabs into draftState if there is no pending draft.
        // This prevents data loss: the published content becomes the starting point for edits.
        const snapshotDraft = dashboard.draftState || {
            layout: dashboard.layout,
            tabs: dashboard.tabs,
            activeTabId: dashboard.activeTabId,
            filters: dashboard.filters,
            _liveSnapshot: true,
            snapshotAt: new Date().toISOString(),
        };

        const updatedDashboard = await Dashboard.findByIdAndUpdate(
            dashboardId,
            {
                $set: {
                    status: 'draft',
                    publishedAt: null,
                    publishedBy: null,
                    draftState: snapshotDraft,
                    updatedBy: req.user?.id || 'anonymous'
                },
                $inc: { __v: 1 }
            },
            { returnDocument: 'after', runValidators: true }
        ).lean();

        return res.json({
            message: 'Dashboard unpublished',
            dashboard: dashboardMapper.fromDB(updatedDashboard)
        });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error', detail: error.message });
    }
};

/** GET /api/dashboards/:dashboardId/draft
 * Get draft state of a dashboard (only owner can see their draft) */
exports.getDraftState = async (req, res) => {
    try {
        const { dashboardId } = req.params;
        const dashboard = await Dashboard.findById(dashboardId).lean();
        if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });

        // Only owner can see draft state
        if (!canEditDashboard(dashboard, req.user)) {
            return res.status(403).json({ message: 'You do not have permission to view draft state' });
        }

        return res.json({ draftState: dashboard.draftState || null });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error', detail: error.message });
    }
};

/** POST /api/dashboards/:dashboardId/save-draft
 * Save draft state without publishing */
exports.saveDraft = async (req, res) => {
    try {
        const { dashboardId } = req.params;
        const dashboard = await Dashboard.findById(dashboardId).lean();
        if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });

        if (!canEditDashboard(dashboard, req.user)) {
            return res.status(403).json({ message: 'You do not have permission to save draft' });
        }

        const { draftState } = req.body;
<<<<<<< HEAD
        if (draftState !== undefined && draftState !== null && typeof draftState !== 'object') {
            return res.status(400).json({ message: 'draftState must be an object when provided' });
        }

        const normalizedDraft = draftState ? { ...draftState } : null;
        if (normalizedDraft?.name && !normalizedDraft.title) {
            normalizedDraft.title = normalizedDraft.name;
        }
        const mappedDraft = normalizedDraft ? dashboardMapper.toDB(normalizedDraft) : null;

        const setObj = {
            draftState: normalizedDraft || null,
            updatedBy: req.user?.id || 'anonymous',
        };

        // If the dashboard is already a draft, keep the primary fields in sync.
        if (dashboard.status === 'draft' && mappedDraft) {
            Object.assign(setObj, mappedDraft, { _rawFrontendState: normalizedDraft });
        }

        const updatedDashboard = await Dashboard.findByIdAndUpdate(
            dashboardId,
            { 
                $set: setObj, 
                $inc: { __v: 1 } 
=======

        // ── Draft state structural validation ────────────────────────────────
        if (draftState !== null && draftState !== undefined) {
            if (typeof draftState !== 'object' || Array.isArray(draftState)) {
                return res.status(400).json({ message: 'draftState must be an object' });
            }

            // Validate tabs structure if provided
            if (draftState.tabs !== undefined) {
                if (!Array.isArray(draftState.tabs)) {
                    return res.status(400).json({ message: 'draftState.tabs must be an array' });
                }
                for (let i = 0; i < draftState.tabs.length; i++) {
                    const tab = draftState.tabs[i];
                    if (typeof tab !== 'object' || !tab.id || !tab.name) {
                        return res.status(400).json({
                            message: `draftState.tabs[${i}] must have id and name fields`,
                        });
                    }
                    if (tab.widgets !== undefined) {
                        if (!Array.isArray(tab.widgets)) {
                            return res.status(400).json({ message: `draftState.tabs[${i}].widgets must be an array` });
                        }
                        const layoutError = validateLayout(tab.widgets);
                        if (layoutError) {
                            return res.status(400).json({
                                message: `Invalid widget layout in draftState.tabs[${i}]: ${layoutError}`,
                            });
                        }
                    }
                }
            }

            // Validate flat layout if provided
            if (draftState.layout !== undefined) {
                if (!Array.isArray(draftState.layout)) {
                    return res.status(400).json({ message: 'draftState.layout must be an array' });
                }
                const layoutError = validateLayout(draftState.layout);
                if (layoutError) {
                    return res.status(400).json({
                        message: `Invalid layout in draftState: ${layoutError}`,
                    });
                }
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        const updatedDashboard = await Dashboard.findByIdAndUpdate(
            dashboardId,
            {
                $set: {
                    draftState: draftState !== undefined ? draftState : null,
                    status: 'draft',
                    updatedBy: req.user?.id || 'anonymous'
                },
                $inc: { __v: 1 }
>>>>>>> 4f72dc9 (feat(security,rbac,drafts): enhance permissions, draft validation, and CSRF protection)
            },
            { returnDocument: 'after', runValidators: true }
        ).lean();

        return res.json({
            message: 'Draft saved',
            dashboard: dashboardMapper.fromDB(updatedDashboard)
        });
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error', detail: error.message });
    }
};
