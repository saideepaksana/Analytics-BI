const Chart = require("../../models/Chart");

const sanitizeStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
};

const buildChartPayload = (body = {}, current = null) => {
  const datasetId = String(body.datasetId || current?.datasetId || "").trim();
  const chartType = String(body.chartType || body.type || current?.chartType || "").trim().toLowerCase();
  const title = String(body.title || current?.title || "Untitled Chart").trim();

  const queryConfig = {
    dimensions: sanitizeStringArray(body.queryConfig?.dimensions || body.dimensions || current?.queryConfig?.dimensions),
    measures: sanitizeStringArray(body.queryConfig?.measures || body.measures || current?.queryConfig?.measures),
    filters: Array.isArray(body.queryConfig?.filters) ? body.queryConfig.filters : (current?.queryConfig?.filters || []),
    sort: Array.isArray(body.queryConfig?.sort) ? body.queryConfig.sort : (current?.queryConfig?.sort || []),
    limit: Number.isFinite(Number(body.queryConfig?.limit)) ? Number(body.queryConfig.limit) : (current?.queryConfig?.limit || 1000),
  };

  const visualization = {
    theme: String(body.visualization?.theme || current?.visualization?.theme || "default"),
    options: body.visualization?.options || current?.visualization?.options || {},
  };

  const state = body.state || current?.state || {};

  return {
    title,
    datasetId,
    chartType,
    queryConfig,
    visualization,
    state,
  };
};

exports.listCharts = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const datasetId = String(req.query.datasetId || "").trim();
    const q = String(req.query.q || "").trim();

    const filter = {};
    if (datasetId) {
      filter.datasetId = datasetId;
    }
    if (q) {
      filter.$text = { $search: q };
    }

    const [charts, total] = await Promise.all([
      Chart.find(filter)
        .sort({ updatedAt: -1 })
        .skip(offset)
        .limit(limit)
        .select("title chartType datasetId version createdAt updatedAt visualization.theme")
        .lean(),
      Chart.countDocuments(filter),
    ]);

    return res.json({ charts, total, limit, offset });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.getChartById = async (req, res) => {
  try {
    const { chartId } = req.params;
    const chart = await Chart.findById(chartId).lean();

    if (!chart) {
      return res.status(404).json({ message: "Chart not found" });
    }

    return res.json({ chart });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.saveChart = async (req, res) => {
  try {
    const chartId = String(req.body.chartId || "").trim();
    const actor = req.user?.id || "anonymous";

    if (chartId) {
      const existing = await Chart.findById(chartId);
      if (!existing) {
        return res.status(404).json({ message: "Chart not found" });
      }

      const payload = buildChartPayload(req.body, existing);
      if (!payload.datasetId || !payload.chartType) {
        return res.status(400).json({ message: "datasetId and chartType are required" });
      }

      existing.set({
        ...payload,
        version: (existing.version || 1) + 1,
        updatedBy: actor,
      });

      await existing.save();
      return res.json({ message: "Chart updated", chart: existing });
    }

    const payload = buildChartPayload(req.body, null);
    if (!payload.datasetId || !payload.chartType) {
      return res.status(400).json({ message: "datasetId and chartType are required" });
    }

    const chart = await Chart.create({
      ...payload,
      createdBy: actor,
      updatedBy: actor,
    });

    return res.status(201).json({ message: "Chart created", chart });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.persistChartState = async (req, res) => {
  try {
    const { chartId } = req.params;
    const state = req.body?.state;

    if (!state || typeof state !== "object" || Array.isArray(state)) {
      return res.status(400).json({ message: "state object is required" });
    }

    const chart = await Chart.findByIdAndUpdate(
      chartId,
      {
        $set: {
          state,
          updatedBy: req.user?.id || "anonymous",
        },
        $inc: { version: 1 },
      },
      { new: true }
    ).lean();

    if (!chart) {
      return res.status(404).json({ message: "Chart not found" });
    }

    return res.json({ message: "State persisted", chart });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};
