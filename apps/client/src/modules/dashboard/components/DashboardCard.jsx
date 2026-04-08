import React, { useEffect, useMemo, useState } from "react";
import { Edit2, Eye, Trash2, LayoutDashboard } from "lucide-react";
import ChartPreview from "../../charts/components/ChartPreview";
import { queryDataset } from "../../../services/charts.service";

const previewDataCache = new Map();
const previewRequestCache = new Map();

const formatUpdatedAt = (value) => {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not saved yet";
  return date.toLocaleDateString();
};

const getMeasuresFromChart = (chart) => {
  if (Array.isArray(chart?.query?.measures) && chart.query.measures.length > 0) {
    return chart.query.measures;
  }
  if (chart?.y) {
    return [{ field: chart.y.field || chart.y, aggregation: chart.y.aggregation || "SUM", label: chart.y.label }];
  }
  return [];
};

const getDimensionsFromChart = (chart) => {
  if (Array.isArray(chart?.query?.dimensions) && chart.query.dimensions.length > 0) {
    return chart.query.dimensions;
  }
  if (chart?.x) {
    return [{ field: chart.x.field || chart.x, type: chart.x.type || "categorical" }];
  }
  return [];
};

const normalizeDimensions = (dimensions = []) => dimensions.map((dimension) => dimension.field || dimension);

const buildChartQuery = (chart) => {
  const dimensions = getDimensionsFromChart(chart);
  const measures = getMeasuresFromChart(chart);
  const query = chart.query || {
    dimensions,
    measures,
    filters: chart.filters || [],
    groupBy: chart.groupBy || dimensions.map((dimension) => dimension.field || dimension),
    orderBy: chart.orderBy || [],
  };

  const chartType = chart.visualization?.type || chart.type;
  const isScatter = chartType === "scatter";
  const isLineOrArea = chartType === "line" || chartType === "area";
  const hasRawMetric = (query.measures || []).some(
    (measure) => (measure.aggregation || "").toUpperCase() === "RAW"
  );

  if (isScatter || (isLineOrArea && hasRawMetric)) {
    return {
      ...query,
      raw: true,
      dimensions: query.dimensions || dimensions,
      measures: query.measures || measures,
      groupBy: [],
      orderBy: [],
    };
  }

  return query;
};

function PreviewWidgetTile({ chart, style }) {
  const [data, setData] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!chart) {
        setReady(false);
        return;
      }

      const datasetId = chart.dataSource?.datasetId || chart.datasetId;
      if (!datasetId) {
        setReady(false);
        return;
      }

      const query = buildChartQuery(chart);
      const cacheKey = `${chart.chartId || chart._id || chart.name || "chart"}:${JSON.stringify(query || {})}`;

      if (previewDataCache.has(cacheKey)) {
        if (!cancelled) {
          setData(previewDataCache.get(cacheKey));
          setReady(true);
        }
        return;
      }

      try {
        let request = previewRequestCache.get(cacheKey);
        if (!request) {
          request = queryDataset(datasetId, query).then((response) => response.results || []);
          previewRequestCache.set(cacheKey, request);
        }
        const results = await request;
        previewRequestCache.delete(cacheKey);
        previewDataCache.set(cacheKey, results);
        if (!cancelled) {
          setData(results);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setReady(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  return (
    <div className="preview-widget-tile" style={style}>
      {ready ? (
        <div className="preview-widget-chart-shell">
          <ChartPreview
            type={chart.visualization?.type || chart.type}
            data={data}
            dimensions={normalizeDimensions(getDimensionsFromChart(chart))}
            measures={getMeasuresFromChart(chart)}
            style={chart.style}
            isPreview={true}
          />
        </div>
      ) : (
        <div className="preview-widget-skeleton" />
      )}
    </div>
  );
}

export default function DashboardCard({ dashboard, charts = [], onView, onEdit, onDelete }) {
  const previewWidgets = Array.isArray(dashboard.widgets) ? dashboard.widgets : [];
  const widgetCount = Array.isArray(previewWidgets) ? previewWidgets.length : 0;

  const previewCols = 24;
  const maxY = previewWidgets.reduce(
    (acc, widget) => Math.max(acc, (widget.y || 0) + (widget.h || 0)),
    12
  );
  const previewRows = Math.max(12, maxY);
  const chartMap = useMemo(() => {
    const map = new Map();
    charts.forEach((chart) => {
      if (chart.chartId) map.set(chart.chartId, chart);
      if (chart._id) map.set(chart._id, chart);
    });
    return map;
  }, [charts]);

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <div>
          <h4 className="dashboard-card-title">{dashboard.name}</h4>
          <div className="dashboard-card-meta">
            <span>{widgetCount} widgets</span>
            <span>Updated {formatUpdatedAt(dashboard.updatedAt)}</span>
          </div>
        </div>
      </div>

      <div className="dashboard-card-body">
        <div className="dashboard-card-preview" style={{ padding: 0, overflow: 'hidden' }}>
          {dashboard.thumbnail ? (
            <img 
              src={dashboard.thumbnail} 
              alt="Dashboard Preview" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
          ) : (
            <div className="preview-empty-state">
              <LayoutDashboard size={18} />
              <span>No preview available</span>
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-card-actions">
        <button className="chart-action-btn" title="View Dashboard" onClick={onView}>
          <Eye size={16} />
        </button>
        <button className="chart-action-btn" title="Edit Dashboard" onClick={onEdit}>
          <Edit2 size={16} />
        </button>
        <button className="chart-action-btn danger" title="Delete Dashboard" onClick={onDelete}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
