const mongoose = require('mongoose');
const Dashboard = require('../../models/Dashboard');
const Chart = require('../../models/Chart');
const { redisConnection } = require('../../core/redis');
const logger = require('../../core/logger');

/**
 * Dashboard Loading Service
 * Handles efficient loading of dashboards with all referenced charts
 */

/**
 * Load dashboard with all chart data
 */
const collectWidgetChartIds = (dashboard) => {
  const ids = new Set();

  const addWidgetIds = (widgets = []) => {
    widgets.forEach((widget) => {
      if (widget && widget.chartId) {
        ids.add(String(widget.chartId));
      }
    });
  };

  if (Array.isArray(dashboard?.tabs)) {
    dashboard.tabs.forEach((tab) => addWidgetIds(tab?.widgets || []));
  }

  if (Array.isArray(dashboard?.layout)) {
    addWidgetIds(dashboard.layout);
  }

  return Array.from(ids);
};

const splitChartIds = (chartRefs = [], widgetChartIds = []) => {
  const objectIdCandidates = new Set();
  const chartIdCandidates = new Set();

  const pushCandidate = (value) => {
    if (!value) return;
    const text = String(value).trim();
    if (!text) return;

    if (mongoose.Types.ObjectId.isValid(text)) {
      objectIdCandidates.add(text);
    } else {
      chartIdCandidates.add(text);
    }
  };

  (Array.isArray(chartRefs) ? chartRefs : []).forEach(pushCandidate);
  (Array.isArray(widgetChartIds) ? widgetChartIds : []).forEach(pushCandidate);

  return {
    objectIds: Array.from(objectIdCandidates),
    chartIds: Array.from(chartIdCandidates),
  };
};

const loadDashboard = async (dashboardId) => {
  // Check cache first
  const cacheKey = `dashboard:${dashboardId}:full`;
  const cached = await redisConnection.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Load dashboard
  const dashboard = await Dashboard.findById(dashboardId).lean();
  if (!dashboard) {
    throw new Error('Dashboard not found');
  }

  const widgetChartIds = collectWidgetChartIds(dashboard);
  const { objectIds, chartIds } = splitChartIds(dashboard.chartRefs || [], widgetChartIds);

  const query = [];
  if (objectIds.length > 0) {
    query.push({ _id: { $in: objectIds } });
  }
  if (chartIds.length > 0) {
    query.push({ chartId: { $in: chartIds } });
  }

  const charts = query.length > 0
    ? await Chart.find({ $or: query }).lean()
    : [];

  // Create chart map for quick lookup
  const chartMap = {};
  charts.forEach(chart => {
    chartMap[chart._id.toString()] = chart;
  });

  // Build full dashboard response
  const fullDashboard = {
    ...dashboard,
    charts: chartMap,
    loadedAt: new Date()
  };

  // Cache for 5 minutes
  await redisConnection.setex(cacheKey, 300, JSON.stringify(fullDashboard));

  return fullDashboard;
};

/**
 * Refresh dashboard cache
 */
const refreshDashboardCache = async (dashboardId) => {
  const cacheKey = `dashboard:${dashboardId}:full`;
  await redisConnection.del(cacheKey);
  logger.info(`Refreshed cache for dashboard ${dashboardId}`, 'DashboardService');
};

/**
 * Load multiple dashboards in parallel
 */
const loadDashboards = async (dashboardIds) => {
  const promises = dashboardIds.map(id => loadDashboard(id));
  return Promise.allSettled(promises);
};

module.exports = {
  loadDashboard,
  refreshDashboardCache,
  loadDashboards
};