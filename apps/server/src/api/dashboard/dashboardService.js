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

  // Get all chart IDs
  const chartIds = dashboard.chartRefs || [];

  // Load all charts in parallel
  const charts = await Chart.find({ _id: { $in: chartIds } }).lean();

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