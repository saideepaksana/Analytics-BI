import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Grip, Loader2, Save, PlusCircle, Trash2 } from "lucide-react";
import ChartPreview from "../../charts/components/ChartPreview";
import { queryDataset } from "../../../services/charts.service";

const ROW_HEIGHT = 42;
const MIN_WIDGET_W = 4;
const MIN_WIDGET_H = 5;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeDimensions = (dimensions = []) => dimensions.map((dimension) => dimension.field || dimension);

const buildChartQuery = (chart) => {
  const query = chart.query || {};
  const isScatter = chart.visualization?.type === "scatter";
  const isLineOrArea = chart.visualization?.type === "line" || chart.visualization?.type === "area";
  const hasRawMetric = (query.measures || []).some(
    (measure) => (measure.aggregation || "").toUpperCase() === "RAW"
  );

  if (isScatter || (isLineOrArea && hasRawMetric)) {
    return {
      ...query,
      raw: true,
      dimensions: query.dimensions || [],
      measures: query.measures || [],
      groupBy: [],
      orderBy: [],
    };
  }

  return query;
};

function DashboardWidgetChart({ chart }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const datasetId = chart.dataSource?.datasetId || chart.datasetId;
        if (!datasetId) {
          throw new Error("No dataset found");
        }

        const response = await queryDataset(datasetId, buildChartQuery(chart));
        if (!cancelled) {
          setData(response.results || []);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load chart data");
          setData([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (loading) {
    return (
      <div className="dashboard-widget-loading">
        <Loader2 size={18} className="spinner" />
        <span>Loading chart...</span>
      </div>
    );
  }

  if (error) {
    return <div className="dashboard-widget-error">{error}</div>;
  }

  return (
    <ChartPreview
      type={chart.visualization?.type || chart.type}
      data={data}
      dimensions={normalizeDimensions(chart.query?.dimensions || [])}
      measures={chart.query?.measures || []}
      style={chart.style}
    />
  );
}

function DashboardWidget({
  widget,
  chart,
  layout,
  readOnly,
  onRemove,
  onDragStart,
  onResizeStart,
}) {
  const style = {
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    width: `${layout.width}px`,
    height: `${layout.height}px`,
  };

  return (
    <article className="dashboard-widget" style={style}>
      <header
        className={`dashboard-widget-header ${readOnly ? "read-only" : ""}`}
        onMouseDown={(event) => {
          if (readOnly) return;
          onDragStart(event, widget.id);
        }}
      >
        <div className="dashboard-widget-title-wrap">
          <Grip size={14} />
          <h5>{chart?.name || "Missing chart"}</h5>
        </div>
        {!readOnly ? (
          <button
            type="button"
            className="dashboard-widget-icon-btn danger"
            onClick={() => onRemove(widget.id)}
            title="Remove chart"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </header>

      <div className="dashboard-widget-body">
        {chart ? <DashboardWidgetChart chart={chart} /> : <div className="dashboard-widget-error">Chart not found</div>}
      </div>

      {!readOnly ? (
        <button
          type="button"
          className="dashboard-widget-resize"
          aria-label="Resize widget"
          title="Resize"
          onMouseDown={(event) => onResizeStart(event, widget.id)}
        />
      ) : null}
    </article>
  );
}

export default function DashboardEditor({
  mode,
  dashboard,
  charts,
  saving,
  onBack,
  onSave,
  onDelete,
}) {
  const readOnly = mode === "view";
  const [name, setName] = useState(dashboard?.name || "Untitled Dashboard");
  const [widgets, setWidgets] = useState(Array.isArray(dashboard?.widgets) ? dashboard.widgets : []);
  const [action, setAction] = useState(null);
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setCanvasSize({ width: rect.width, height: rect.height });
    });

    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  const columns = canvasSize.width < 900 ? 12 : 24;
  const cellWidth = canvasSize.width > 0 ? canvasSize.width / columns : 0;

  const chartMap = useMemo(() => {
    return new Map((charts || []).map((chart) => [chart.chartId || chart._id, chart]));
  }, [charts]);

  const maxGridRows = useMemo(() => {
    const maxY = widgets.reduce((acc, widget) => Math.max(acc, (widget.y || 0) + (widget.h || MIN_WIDGET_H)), 0);
    return Math.max(maxY + 2, 14);
  }, [widgets]);

  const canvasMinHeight = Math.max(canvasSize.height, maxGridRows * ROW_HEIGHT);

  const widgetLayout = useMemo(() => {
    return widgets.map((widget) => ({
      ...widget,
      left: widget.x * cellWidth,
      top: widget.y * ROW_HEIGHT,
      width: widget.w * cellWidth,
      height: widget.h * ROW_HEIGHT,
    }));
  }, [widgets, cellWidth]);

  const addChartWidget = useCallback(
    (chartId) => {
      const defaultW = columns >= 20 ? 8 : 6;
      const defaultH = 8;
      const maxY = widgets.reduce((acc, widget) => Math.max(acc, (widget.y || 0) + (widget.h || defaultH)), 0);
      const nextWidget = {
        id: `widget-${Date.now()}-${Math.round(Math.random() * 10000)}`,
        chartId,
        x: 0,
        y: maxY,
        w: defaultW,
        h: defaultH,
      };

      setWidgets((previous) => [...previous, nextWidget]);
    },
    [columns, widgets]
  );

  const removeWidget = useCallback((widgetId) => {
    setWidgets((previous) => previous.filter((widget) => widget.id !== widgetId));
  }, []);

  useEffect(() => {
    if (!action) return undefined;

    const onMouseMove = (event) => {
      if (!cellWidth) return;

      setWidgets((previous) => {
        const index = previous.findIndex((widget) => widget.id === action.widgetId);
        if (index === -1) return previous;

        const current = previous[index];
        const updated = [...previous];

        if (action.type === "drag") {
          const movedPixelsX = event.clientX - action.startClientX;
          const movedPixelsY = event.clientY - action.startClientY;
          const nextX = clamp(action.originX + Math.round(movedPixelsX / cellWidth), 0, columns - current.w);
          const nextY = Math.max(0, action.originY + Math.round(movedPixelsY / ROW_HEIGHT));
          updated[index] = { ...current, x: nextX, y: nextY };
        }

        if (action.type === "resize") {
          const movedPixelsX = event.clientX - action.startClientX;
          const movedPixelsY = event.clientY - action.startClientY;
          const nextW = clamp(action.originW + Math.round(movedPixelsX / cellWidth), MIN_WIDGET_W, columns - current.x);
          const nextH = Math.max(MIN_WIDGET_H, action.originH + Math.round(movedPixelsY / ROW_HEIGHT));
          updated[index] = { ...current, w: nextW, h: nextH };
        }

        return updated;
      });
    };

    const onMouseUp = () => {
      setAction(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [action, cellWidth, columns]);

  const startDrag = (event, widgetId) => {
    event.preventDefault();
    const widget = widgets.find((item) => item.id === widgetId);
    if (!widget) return;

    setAction({
      type: "drag",
      widgetId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: widget.x,
      originY: widget.y,
    });
  };

  const startResize = (event, widgetId) => {
    event.preventDefault();
    const widget = widgets.find((item) => item.id === widgetId);
    if (!widget) return;

    setAction({
      type: "resize",
      widgetId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originW: widget.w,
      originH: widget.h,
    });
  };

  const submitSave = () => {
    onSave({
      id: dashboard?.id,
      name,
      widgets,
    });
  };

  return (
    <div className="dashboard-editor-page">
      <div className="dashboard-editor-topbar">
        <div className="dashboard-editor-title-row">
          <button type="button" className="dashboard-secondary-btn" onClick={onBack}>
            <ArrowLeft size={16} />
            Back
          </button>

          <input
            type="text"
            className="dashboard-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={readOnly}
            placeholder="Dashboard name"
          />
        </div>

        <div className="dashboard-editor-actions">
          {!readOnly ? (
            <button type="button" className="create-chart-btn" onClick={submitSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
              Save dashboard
            </button>
          ) : null}
          {!readOnly && dashboard?.id ? (
            <button type="button" className="dashboard-danger-btn" onClick={() => onDelete?.(dashboard.id)}>
              <Trash2 size={16} />
              Delete
            </button>
          ) : null}
        </div>
      </div>

      <div className="dashboard-editor-content">
        {!readOnly ? (
          <aside className="dashboard-chart-library">
            <h4>Charts Gallery</h4>
            <p>Add charts and place them in your dashboard grid.</p>

            <div className="dashboard-library-list">
              {(charts || []).map((chart) => {
                const id = chart.chartId || chart._id;
                return (
                  <button
                    key={id}
                    type="button"
                    className="dashboard-library-item"
                    onClick={() => addChartWidget(id)}
                  >
                    <span>
                      <strong>{chart.name}</strong>
                      <small>{chart.visualization?.type || "chart"}</small>
                    </span>
                    <PlusCircle size={15} />
                  </button>
                );
              })}
              {(charts || []).length === 0 ? <p className="library-empty">Create charts first to build dashboards.</p> : null}
            </div>
          </aside>
        ) : null}

        <section className="dashboard-canvas-pane">
          <div className="dashboard-canvas-toolbar">
            <span>
              Grid: {columns} columns • Drag chart headers to move • Use corner handle to resize
            </span>
          </div>

          <div className="dashboard-canvas-wrapper" ref={canvasRef}>
            <div
              className="dashboard-canvas-grid"
              style={{
                minHeight: `${canvasMinHeight}px`,
                backgroundSize: `${Math.max(cellWidth, 24)}px ${ROW_HEIGHT}px`,
              }}
            >
              {widgetLayout.map((widget) => (
                <DashboardWidget
                  key={widget.id}
                  widget={widget}
                  chart={chartMap.get(widget.chartId)}
                  layout={widget}
                  readOnly={readOnly}
                  onRemove={removeWidget}
                  onDragStart={startDrag}
                  onResizeStart={startResize}
                />
              ))}
              {widgetLayout.length === 0 ? (
                <div className="dashboard-canvas-empty">
                  <h3>{readOnly ? "This dashboard is empty" : "Build your dashboard layout"}</h3>
                  <p>
                    {readOnly
                      ? "No chart widgets were added to this dashboard yet."
                      : "Add charts from the gallery, drag to position, and resize to fit your story."}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
