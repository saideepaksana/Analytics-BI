const Dashboard = require("../../models/Dashboard");
const { v4: uuidv4 } = require('uuid');

exports.listDashboards = async (req, res) => {
  try {
    const dashboards = await Dashboard.find().sort({ updatedAt: -1 }).lean();
    return res.json({ dashboards });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.createDashboard = async (req, res) => {
  try {
    const { title = 'New Dashboard', description = '', tags = [], layout = [] } = req.body;
    const dashboard = await Dashboard.create({ title, description, tags, layout, createdBy: req.user?.id || 'anonymous' });
    return res.status(201).json({ dashboard });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const dashboard = await Dashboard.findById(req.params.dashboardId).lean();
    if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });
    return res.json({ dashboard });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.deleteDashboard = async (req, res) => {
  try {
    const deleted = await Dashboard.findByIdAndDelete(req.params.dashboardId);
    if (!deleted) return res.status(404).json({ message: 'Dashboard not found' });
    return res.json({ message: 'Dashboard deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.saveDashboardLayout = async (req, res) => {
  try {
    const { layout } = req.body;
    if (!Array.isArray(layout)) return res.status(400).json({ message: 'layout must be an array' });
    const dashboard = await Dashboard.findByIdAndUpdate(
      req.params.dashboardId,
      { $set: { layout, updatedBy: req.user?.id || 'anonymous' } },
      { returnDocument: 'after', runValidators: false }
    ).lean();
    if (!dashboard) return res.status(404).json({ message: 'Dashboard not found' });
    return res.json({ dashboard });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const ALLOWED_METADATA_FIELDS = new Set(["title", "description", "tags", "isFavorite", "status"]);
const ALLOWED_STATUS_VALUES = new Set(["draft", "published"]);

exports.patchDashboardMetadata = async (req, res) => {
  try {
    const { dashboardId } = req.params;
    const updates = req.body || {};

    const setObj = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_METADATA_FIELDS.has(key)) {
        continue;
      }

      if (key === "tags") {
        setObj.tags = Array.isArray(value)
          ? value.map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        continue;
      }

      if (key === "title" || key === "description" || key === "status") {
        const normalizedValue = String(value || "").trim();

        if (key === "status" && !ALLOWED_STATUS_VALUES.has(normalizedValue)) {
          return res.status(400).json({
            message: "Invalid status value",
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
        message: "No valid metadata fields provided",
        allowedFields: Array.from(ALLOWED_METADATA_FIELDS),
      });
    }

    setObj.updatedBy = req.user?.id || "anonymous";

    const dashboard = await Dashboard.findByIdAndUpdate(
      dashboardId,
      { $set: setObj },
      { returnDocument: 'after', runValidators: true }
    ).lean();

    if (!dashboard) {
      return res.status(404).json({ message: "Dashboard not found" });
    }

    return res.json({ message: "Dashboard metadata updated", dashboard });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};
