import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Grip, Loader2, MoveDiagonal2, Pencil, Plus, PlusCircle, Save, Trash2, X, MoreVertical, Star, User, Clock, MessageSquare, Download, Image as ImageIcon, FileText as PdfIcon } from "lucide-react";
import html2canvas from "html2canvas";
import { useExportStatus } from "../../../hooks/useExportStatus";
import ChartPreview from "../../charts/components/ChartPreview";
import { queryDataset } from "../../../services/charts.service";
import * as annotationsService from "../../../services/annotations.service";

const ROW_HEIGHT = 42;
const MIN_WIDGET_W = 4;
const MIN_WIDGET_H = 5;

const previewDataCache = new Map();
const previewRequestCache = new Map();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const rectanglesOverlap = (a, b) => {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
};

const canPlaceWidget = (widgets, widgetId, candidate) => {
  return !widgets.some((item) => {
    if (item.id === widgetId) return false;
    return rectanglesOverlap(candidate, item);
  });
};

const findFirstFit = (widgets, width, height, columns) => {
  const safeWidth = Math.min(width, columns);
  const maxRowsToScan = 220;
  for (let y = 0; y <= maxRowsToScan; y += 1) {
    for (let x = 0; x <= columns - safeWidth; x += 1) {
      const candidate = { x, y, w: safeWidth, h: height };
      if (canPlaceWidget(widgets, "__new__", candidate)) {
        return candidate;
      }
    }
  }

  const maxY = widgets.reduce((acc, widget) => Math.max(acc, widget.y + widget.h), 0);
  return { x: 0, y: maxY, w: safeWidth, h: height };
};

const normalizeDimensions = (dimensions = []) => dimensions.map((dimension) => dimension.field || dimension);

const getMeasuresFromChart = (chart) => {
  if (Array.isArray(chart?.query?.measures) && chart.query.measures.length > 0) {
    return chart.query.measures;
  }

  if (chart?.y) {
    return [{
      field: chart.y.field || chart.y,
      aggregation: chart.y.aggregation || "SUM",
      label: chart.y.label,
    }];
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

const buildChartQuery = (chart) => {
  const measures = getMeasuresFromChart(chart);
  const dimensions = getDimensionsFromChart(chart);
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

  if (!Array.isArray(query.measures) || query.measures.length === 0) {
    return {
      ...query,
      dimensions,
      measures,
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

        const query = buildChartQuery(chart);
        const cacheKey = `${chart.chartId || chart._id || chart.name || "chart"}:${JSON.stringify(query)}`;

        if (previewDataCache.has(cacheKey)) {
          if (!cancelled) {
            setData(previewDataCache.get(cacheKey));
            setLoading(false);
          }
          return;
        }

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
      dimensions={normalizeDimensions(getDimensionsFromChart(chart))}
      measures={getMeasuresFromChart(chart)}
      style={{ ...chart.style, minHeight: "0px" }}
      stacking={chart.visualization?.series?.stack || false}
      onRenderComplete={chart.onRenderComplete}
    />
  );
}

function DashboardWidget({
  widget,
  chart,
  layout,
  readOnly,
  annotations = [],
  onRemove,
  onDragStart,
  onResizeStart,
  isDragging,
  isResizing,
  onUpdateWidget,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onRenderComplete,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [isEditingAnnotation, setIsEditingAnnotation] = useState(false);
  const [annotationToEdit, setAnnotationToEdit] = useState(null);
  const [tempAnnotation, setTempAnnotation] = useState("");

  const style = {
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    width: `${layout.width}px`,
    height: `${layout.height}px`,
  };

  const activeClass = isDragging ? "is-dragging" : isResizing ? "is-resizing" : "";

  const handleSaveAnnotation = async () => {
    if (!tempAnnotation.trim()) return;

    if (annotationToEdit) {
      await onUpdateAnnotation(annotationToEdit._id, tempAnnotation.trim());
    } else {
      await onAddAnnotation(widget.chartId, tempAnnotation.trim());
    }

    setIsEditingAnnotation(false);
    setAnnotationToEdit(null);
    setTempAnnotation("");
  };

  return (
    <article className={`dashboard-widget ${activeClass}`} style={style}>
      <header
        className={`dashboard-widget-header ${readOnly ? "read-only" : ""}`}
        onMouseDown={(event) => {
          if (readOnly) return;
          onDragStart(event, widget.id);
        }}
      >
        <div className="dashboard-widget-title-wrap">
          {!readOnly && <Grip size={14} className="dashboard-widget-drag-handle" />}
          {isEditingTitle ? (
            <input
              autoFocus
              className="dashboard-name-input"
              style={{
                padding: "0 4px",
                fontSize: "12px",
                height: "auto",
                minHeight: "20px",
                margin: 0,
                width: "100%",
                border: "1px solid var(--border)",
                borderRadius: "4px",
              }}
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={() => {
                setIsEditingTitle(false);
                onUpdateWidget(widget.id, { title: tempTitle.trim() });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditingTitle(false);
                  onUpdateWidget(widget.id, { title: tempTitle.trim() });
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <h5>{widget.title || chart?.name || "Missing chart"}</h5>
          )}
        </div>
        <div className="dashboard-widget-actions">
          {!readOnly && (
            <>
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  type="button"
                  className="dashboard-widget-icon-btn action"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowMenu(!showMenu);
                  }}
                  title="Menu"
                >
                  <MoreVertical size={13} />
                </button>
                {showMenu && (
                  <div
                    className="dashboard-widget-menu"
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "100%",
                      background: "var(--bg-3, #1e2126)",
                      border: "1px solid var(--border, #333)",
                      borderRadius: "4px",
                      padding: "4px 0",
                      zIndex: 100,
                      minWidth: "120px",
                      boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        width: "100%",
                        padding: "6px 12px",
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        color: "var(--fg-1, #e0e0e0)",
                        cursor: "pointer",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowMenu(false);
                        setTempTitle(widget.title || chart?.name || "");
                        setIsEditingTitle(true);
                      }}
                    >
                      <Pencil size={12} />
                      Rename
                    </button>
                    <button
                      type="button"
                      style={{
                        width: "100%",
                        padding: "6px 12px",
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        color: "var(--fg-1, #e0e0e0)",
                        cursor: "pointer",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowMenu(false);
                        setTempAnnotation("");
                        setAnnotationToEdit(null);
                        setIsEditingAnnotation(true);
                      }}
                    >
                      <MessageSquare size={12} />
                      Add Annotation
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="dashboard-widget-icon-btn danger"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(widget.id);
                }}
                title="Remove chart"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="dashboard-widget-body">
        {chart ? (
          <DashboardWidgetChart chart={{ ...chart, onRenderComplete }} />
        ) : (
          <div className="dashboard-widget-error">Chart not found</div>
        )}
      </div>

      <div className="dashboard-widget-annotations-area">
        {annotations.length > 0 && (
          <div
            style={{
              fontSize: "10px",
              fontWeight: "700",
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "0.1em",
              marginBottom: "4px",
              textTransform: "uppercase",
            }}
          >
            Notes
          </div>
        )}
        {annotations.map((ann) => (
          <div key={ann._id} className="dashboard-widget-annotation">
            <p>{ann.text}</p>
            {!readOnly && (
              <div className="annotation-actions">
                <button
                  type="button"
                  onClick={() => {
                    setAnnotationToEdit(ann);
                    setTempAnnotation(ann.text);
                    setIsEditingAnnotation(true);
                  }}
                >
                  Edit
                </button>
                <button type="button" onClick={() => onDeleteAnnotation(ann._id)}>
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}

        {isEditingAnnotation && (
          <div className="dashboard-widget-annotation-editor">
            <textarea
              autoFocus
              value={tempAnnotation}
              onChange={(e) => setTempAnnotation(e.target.value)}
              placeholder="Enter annotation..."
            />
            <div className="editor-buttons">
              <button type="button" className="save-btn" onClick={handleSaveAnnotation}>
                Save
              </button>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => {
                  setIsEditingAnnotation(false);
                  setAnnotationToEdit(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!readOnly ? (
        <button
          type="button"
          className="dashboard-widget-resize"
          aria-label="Resize widget"
          title="Resize"
          onMouseDown={(event) => {
            event.stopPropagation();
            onResizeStart(event, widget.id);
          }}
        >
          <MoveDiagonal2 size={12} />
        </button>
      ) : null}
    </article>
  );
}

export default function DashboardEditor({ mode, dashboard, charts, saving, onBack, onSave, onAutoSave, onDelete }) {
  const isNewOrEmpty = !dashboard?.id || (Array.isArray(dashboard?.widgets) && dashboard.widgets.length === 0);
  const [isEditMode, setIsEditMode] = useState(isNewOrEmpty);
  const readOnly = !isEditMode;
  const [name, setName] = useState(dashboard?.name || "Untitled Dashboard");
  const [savingLocal, setSavingLocal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const { status, startExport, reset } = useExportStatus();
  const [widgets, setWidgets] = useState(() => {
    if (Array.isArray(dashboard?.widgets) && dashboard.widgets.length > 0) {
      return dashboard.widgets;
    }

    if (Array.isArray(dashboard?.sections) && dashboard.sections.length > 0) {
      const activeSection = dashboard.sections.find((section) => section.id === dashboard.activeSectionId);
      return activeSection?.widgets || dashboard.sections[0]?.widgets || [];
    }

    return [];
  });
  const [annotations, setAnnotations] = useState([]);

  // Apply frozen state in export mode
  const [renderedCount, setRenderedCount] = useState(0);
  
  useEffect(() => {
    if (window.IS_EXPORT_MODE) {
      try {
        const stored = localStorage.getItem("export_frozen_state");
        if (stored) {
          const state = JSON.parse(stored);
          if (state.layout) {
            setWidgets(state.layout);
          }
        }
      } catch (e) {
        console.error("Failed to apply frozen state", e);
        window.RENDER_COMPLETE = true;
      }
    }
  }, []);

  const handleChartRendered = useCallback(() => {
    if (!window.IS_EXPORT_MODE) return;
    
    setRenderedCount(prev => {
        const next = prev + 1;
        if (next >= widgets.length) {
            window.RENDER_COMPLETE = true;
            console.log("[Export] All charts rendered. Signal sent.");
        }
        return next;
    });
  }, [widgets.length]);

  useEffect(() => {
    if (dashboard?.id) {
      annotationsService.getAnnotationsByDashboard(dashboard.id).then(setAnnotations);
    }
  }, [dashboard?.id]);

  const handleAddAnnotation = async (chartId, text) => {
    try {
      const newAnn = await annotationsService.createAnnotation({
        chartId,
        dashboardId: dashboard.id,
        text,
        position: { x: 0, y: 0 }, // Default position as it's rendered below
      });
      setAnnotations((prev) => [newAnn, ...prev]);
    } catch (err) {
      console.error("Failed to add annotation", err);
    }
  };

  const handleUpdateAnnotation = async (annId, text) => {
    try {
      const updatedAnn = await annotationsService.updateAnnotation(annId, { text });
      setAnnotations((prev) =>
        prev.map((ann) => (ann._id === annId ? updatedAnn : ann))
      );
    } catch (err) {
      console.error("Failed to update annotation", err);
    }
  };

  const handleDeleteAnnotation = async (annId) => {
    try {
      await annotationsService.deleteAnnotation(annId);
      setAnnotations((prev) => prev.filter((ann) => ann._id !== annId));
    } catch (err) {
      console.error("Failed to delete annotation", err);
    }
  };
  const [action, setAction] = useState(null);
  const [showChartLibrary, setShowChartLibrary] = useState(false);
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const mousePosRef = useRef(null);
  const scrollIntervalRef = useRef(null);

  // Track the last known saved state to avoid redundant saves
  const lastStateRef = useRef({
    name: dashboard?.name || "",
    widgets: JSON.stringify(widgets || []),
  });

  // Check for meaningful changes in layout or metadata
  const hasChanges = useCallback(() => {
    const currentWidgetsJson = JSON.stringify(widgets || []);
    return (
      name !== lastStateRef.current.name ||
      currentWidgetsJson !== lastStateRef.current.widgets
    );
  }, [name, widgets]);

  // Validate layout for collisions and dimension constraints
  const validateLayout = useCallback(() => {
    if (!name || !name.trim()) return "Please provide a dashboard name";

    for (let i = 0; i < (widgets || []).length; i++) {
      const a = widgets[i];
      if (a.w < 1 || a.h < 1) return `Widget ${a.id || i} has invalid size`;

      for (let j = i + 1; j < widgets.length; j++) {
        const b = widgets[j];
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        if (overlap) return "Widgets cannot overlap. Please adjust the layout.";
      }
    }
    return null;
  }, [name, widgets]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!isEditMode || !dashboard?.id) return undefined;
    if (!hasChanges()) return undefined;

    // Only skip auto-save if validation fails; manual save will still show error alerts.
    if (validateLayout()) return undefined;

    const timer = setTimeout(() => {
      onAutoSave?.({
        id: dashboard.id,
        name: name.trim(),
        widgets,
      });
      lastStateRef.current = {
        name: name.trim(),
        widgets: JSON.stringify(widgets),
      };
    }, 2000);

    return () => clearTimeout(timer);
  }, [name, widgets, isEditMode, dashboard?.id, onAutoSave, hasChanges, validateLayout]);

  useEffect(() => {
    // Intentionally left blank:
    // User wants edit mode ONLY when toggled or when initializing a brand new/empty dashboard.
  }, [mode]);

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

  const baseColumns = canvasSize.width < 900 ? 12 : 24;
  const cellWidth = canvasSize.width > 0 ? canvasSize.width / baseColumns : 0;

  const chartMap = useMemo(() => {
    const map = new Map();
    (charts || []).forEach((chart) => {
      if (chart.chartId) map.set(chart.chartId, chart);
      if (chart._id) map.set(chart._id, chart);
    });
    return map;
  }, [charts]);

  const maxGridCols = useMemo(() => {
    let maxX = widgets.reduce((acc, widget) => Math.max(acc, (widget.x || 0) + (widget.w || MIN_WIDGET_W)), 0);
    if (action && action.targetX !== undefined && action.targetW !== undefined) {
      maxX = Math.max(maxX, action.targetX + action.targetW);
    }
    return Math.max(maxX, baseColumns);
  }, [widgets, action, baseColumns]);

  const maxGridRows = useMemo(() => {
    let maxY = widgets.reduce((acc, widget) => Math.max(acc, (widget.y || 0) + (widget.h || MIN_WIDGET_H)), 0);

    // Auto-extend vertically while dragging or resizing
    if (action && action.targetY !== undefined && action.targetH !== undefined) {
      maxY = Math.max(maxY, action.targetY + action.targetH);
    }

    return Math.max(maxY, Math.ceil(canvasSize.height / ROW_HEIGHT));
  }, [widgets, action, canvasSize.height]);

  const canvasMinWidth = Math.max(canvasSize.width, maxGridCols * cellWidth);
  const canvasMinHeight = Math.max(canvasSize.height, maxGridRows * ROW_HEIGHT);

  const widgetLayout = useMemo(() => {
    return widgets.map((widget) => {
      const isActionTarget = action?.widgetId === widget.id;
      if (isActionTarget && action?.type === "drag") {
        return {
          ...widget,
          left: (widget.x * cellWidth) + action.deltaX,
          top: (widget.y * ROW_HEIGHT) + action.deltaY,
          width: widget.w * cellWidth,
          height: widget.h * ROW_HEIGHT,
        };
      }
      if (isActionTarget && action?.type === "resize") {
        return {
          ...widget,
          left: widget.x * cellWidth,
          top: widget.y * ROW_HEIGHT,
          width: Math.max((widget.w * cellWidth) + action.deltaX, MIN_WIDGET_W * cellWidth),
          height: Math.max((widget.h * ROW_HEIGHT) + action.deltaY, MIN_WIDGET_H * ROW_HEIGHT),
        };
      }
      return {
        ...widget,
        left: widget.x * cellWidth,
        top: widget.y * ROW_HEIGHT,
        width: widget.w * cellWidth,
        height: widget.h * ROW_HEIGHT,
      };
    });
  }, [widgets, cellWidth, action]);

  const dropPlaceholder = useMemo(() => {
    if (!action || !action.widgetId || action.targetX === undefined) return null;
    return {
      left: action.targetX * cellWidth,
      top: action.targetY * ROW_HEIGHT,
      width: action.targetW * cellWidth,
      height: action.targetH * ROW_HEIGHT,
    };
  }, [action, cellWidth]);

  const addChartWidget = useCallback((chartId) => {
    const defaultW = baseColumns >= 20 ? 8 : 6;
    const defaultH = 8;
    setWidgets((previous) => {
      const nextPosition = findFirstFit(previous, defaultW, defaultH, baseColumns);
      const nextWidget = {
        id: `widget-${Date.now()}-${Math.round(Math.random() * 10000)}`,
        chartId,
        x: nextPosition.x,
        y: nextPosition.y,
        w: nextPosition.w,
        h: nextPosition.h,
      };
      return [...previous, nextWidget];
    });
    setShowChartLibrary(false);
  }, [baseColumns]);

  const removeWidget = useCallback((widgetId) => {
    setWidgets((previous) => previous.filter((widget) => widget.id !== widgetId));
  }, []);

  const updateWidget = useCallback((widgetId, updates) => {
    setWidgets((previous) =>
      previous.map((widget) => (widget.id === widgetId ? { ...widget, ...updates } : widget))
    );
  }, []);

  useEffect(() => {
    if (!action || !isEditMode) return undefined;

    const simulateMove = (clientX, clientY) => {
      setAction((prev) => {
        if (!prev) return prev;
        const currentScrollTop = canvasRef.current?.scrollTop || 0;
        const currentScrollLeft = canvasRef.current?.scrollLeft || 0;
        const deltaX = (clientX + currentScrollLeft) - (prev.startClientX + (prev.startScrollLeft || 0));
        const deltaY = (clientY + currentScrollTop) - (prev.startClientY + (prev.startScrollTop || 0));

        let nextX = prev.originX;
        let nextY = prev.originY;
        let nextW = prev.originW || MIN_WIDGET_W;
        let nextH = prev.originH || MIN_WIDGET_H;

        const current = widgets.find((w) => w.id === prev.widgetId);
        if (!current) return prev;

        if (prev.type === "drag") {
          nextX = Math.max(0, prev.originX + Math.round(deltaX / cellWidth));
          nextY = Math.max(0, prev.originY + Math.round(deltaY / ROW_HEIGHT));
        } else if (prev.type === "resize") {
          nextW = Math.max(MIN_WIDGET_W, prev.originW + Math.round(deltaX / cellWidth));
          nextH = Math.max(MIN_WIDGET_H, prev.originH + Math.round(deltaY / ROW_HEIGHT));
        }

        const candidate = { ...current, x: nextX, y: nextY, w: nextW, h: nextH };
        const canPlace = canPlaceWidget(widgets, current.id, candidate);

        return {
          ...prev,
          deltaX,
          deltaY,
          targetX: canPlace ? nextX : prev.targetX,
          targetY: canPlace ? nextY : prev.targetY,
          targetW: canPlace ? nextW : prev.targetW,
          targetH: canPlace ? nextH : prev.targetH,
        };
      });
    };

    const processEdgeScrolling = (clientX, clientY) => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }

      const container = canvasRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const threshold = 60;
      let scrollSpeedY = 0;
      let scrollSpeedX = 0;

      if (clientY > rect.bottom - threshold) {
        scrollSpeedY = 15;
      } else if (clientY < rect.top + threshold) {
        scrollSpeedY = -15;
      }

      if (clientX > rect.right - threshold) {
        scrollSpeedX = 15;
      } else if (clientX < rect.left + threshold) {
        scrollSpeedX = -15;
      }

      if (scrollSpeedY !== 0 || scrollSpeedX !== 0) {
        scrollIntervalRef.current = setInterval(() => {
          if (container) {
            container.scrollTop += scrollSpeedY;
            container.scrollLeft += scrollSpeedX;
            if (mousePosRef.current) simulateMove(mousePosRef.current.x, mousePosRef.current.y);
          }
        }, 16);
      }
    };

    const onMouseMove = (event) => {
      if (!cellWidth) return;
      mousePosRef.current = { x: event.clientX, y: event.clientY };
      processEdgeScrolling(event.clientX, event.clientY);
      simulateMove(event.clientX, event.clientY);
    };

    const onMouseUp = () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
      mousePosRef.current = null;

      setAction((prev) => {
        if (prev && prev.targetX !== undefined) {
          setWidgets((prevWidgets) =>
            prevWidgets.map((w) =>
              w.id === prev.widgetId
                ? { ...w, x: prev.targetX, y: prev.targetY, w: prev.targetW, h: prev.targetH }
                : w
            )
          );
        }
        return null;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [action?.type, action?.widgetId, cellWidth, baseColumns, isEditMode, widgets]);

  const startDrag = (event, widgetId) => {
    if (!isEditMode) return;
    event.preventDefault();
    const widget = widgets.find((item) => item.id === widgetId);
    if (!widget) return;

    setAction({
      type: "drag",
      widgetId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollTop: canvasRef.current?.scrollTop || 0,
      startScrollLeft: canvasRef.current?.scrollLeft || 0,
      originX: widget.x,
      originY: widget.y,
      originW: widget.w,
      originH: widget.h,
      targetX: widget.x,
      targetY: widget.y,
      targetW: widget.w,
      targetH: widget.h,
      deltaX: 0,
      deltaY: 0,
    });
  };

  const startResize = (event, widgetId) => {
    if (!isEditMode) return;
    event.preventDefault();
    const widget = widgets.find((item) => item.id === widgetId);
    if (!widget) return;

    setAction({
      type: "resize",
      widgetId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollTop: canvasRef.current?.scrollTop || 0,
      startScrollLeft: canvasRef.current?.scrollLeft || 0,
      originX: widget.x,
      originY: widget.y,
      originW: widget.w,
      originH: widget.h,
      targetX: widget.x,
      targetY: widget.y,
      targetW: widget.w,
      targetH: widget.h,
      deltaX: 0,
      deltaY: 0,
    });
  };

  const submitSave = async () => {
    setSavingLocal(true);
    let thumbnail = dashboard?.thumbnail || null;

    const error = validateLayout();
    if (error) {
      alert(error);
      setSavingLocal(false);
      return;
    }

    try {
      const gridEl = document.querySelector(".dashboard-canvas-grid");
      if (gridEl) {
        await new Promise(r => setTimeout(r, 100)); // wait for redraw

        const canvas = await html2canvas(gridEl, {
          scale: 0.5,
          useCORS: true,
          backgroundColor: "#181b1f",
          ignoreElements: (element) =>
            element.classList.contains("dashboard-widget-resize") ||
            element.classList.contains("dashboard-widget-placeholder") ||
            element.classList.contains("dashboard-canvas-toolbar")
        });
        thumbnail = canvas.toDataURL("image/jpeg", 0.6);
      }
    } catch (err) {
      console.warn("Failed to generate dashboard thumbnail", err);
    }

    onSave({
      id: dashboard?.id,
      name: name.trim(),
      widgets,
      thumbnail
    });

    lastStateRef.current = {
      name: name.trim(),
      widgets: JSON.stringify(widgets),
    };

    setSavingLocal(false);
  };

  const handleExport = (format) => {
    // Pipeline B: Capture frozen state
    const frozenState = {
      activeTab: null, // If tabs were implemented
      viewport: { width: window.innerWidth, height: window.innerHeight },
      layout: widgets
    };

    startExport("visual", { 
      dashboardId: dashboard.id, 
      format, 
      frozenState 
    });
    setShowExportMenu(false);
  };

  const isSaving = saving || savingLocal;

  return (
    <div className="dashboard-editor-page">
      <div className="dashboard-editor-topbar">
        <div className="dashboard-editor-title-row">
          <button type="button" className="dashboard-topbar-back-btn" onClick={onBack} title="Back">
            <ArrowLeft size={18} />
          </button>

          {isEditMode ? (
            <input
              type="text"
              className="dashboard-name-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Dashboard name"
            />
          ) : (
            <div className="dashboard-superset-title-group">
              <h1 className="dashboard-superset-title">{name}</h1>
            </div>
          )}
        </div>

        <div className="dashboard-editor-actions">
          {!isEditMode ? (
            <>
              <button type="button" className="dashboard-primary-btn" onClick={() => setIsEditMode(true)}>
                Edit dashboard
              </button>
              
              <div className="dashboard-export-wrapper" style={{ position: "relative" }}>
                <button 
                  type="button" 
                  className={`dashboard-secondary-btn ${status ? "active" : ""}`} 
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={status === "processing" || status === "initiating"}
                >
                  {status === "processing" || status === "initiating" ? (
                    <Loader2 size={14} className="spinner" />
                  ) : (
                    <>
                      <Download size={14} />
                      Export
                    </>
                  )}
                </button>

                {showExportMenu && (
                  <div className="export-dropdown" style={{ left: "auto", right: 0 }}>
                    <button onClick={() => handleExport("pdf")}>
                      <PdfIcon size={14} /> PDF Document
                    </button>
                    <button onClick={() => handleExport("png")}>
                      <ImageIcon size={14} /> PNG Image
                    </button>
                  </div>
                )}

                {status === "completed" && (
                  <div className="export-success-toast" style={{ left: "auto", right: 0 }} onClick={reset}>
                    ✓ Ready
                  </div>
                )}
              </div>

              <button type="button" className="dashboard-icon-only-btn">
                <MoreVertical size={16} />
              </button>
            </>
          ) : (
            <>
              <button type="button" className="dashboard-secondary-btn" onClick={() => setShowChartLibrary((prev) => !prev)}>
                <Plus size={14} />
                Add chart
              </button>
              <button type="button" className="dashboard-primary-btn" onClick={submitSave} disabled={isSaving}>
                {isSaving ? <Loader2 size={14} className="spinner" /> : "Save"}
              </button>
              <button type="button" className="dashboard-secondary-btn discard" onClick={() => setIsEditMode(false)}>
                Discard
              </button>
            </>
          )}
        </div>
      </div>

      <div className="dashboard-editor-content">
        <section className="dashboard-canvas-pane">
          <div className="dashboard-canvas-wrapper" ref={canvasRef}>
            <div
              className={`dashboard-canvas-grid ${!isEditMode ? "view-mode" : ""}`}
              style={{
                minHeight: `${canvasMinHeight}px`,
                minWidth: `${canvasMinWidth}px`,
                backgroundSize: `${Math.max(cellWidth, 24)}px ${ROW_HEIGHT}px`,
              }}
            >
              {dropPlaceholder ? (
                <div
                  className="dashboard-widget-placeholder"
                  style={{
                    left: `${dropPlaceholder.left}px`,
                    top: `${dropPlaceholder.top}px`,
                    width: `${dropPlaceholder.width}px`,
                    height: `${dropPlaceholder.height}px`,
                  }}
                />
              ) : null}
              {cellWidth > 0 && widgetLayout.map((widget, index) => (
                <DashboardWidget
                  key={widget.id}
                  widget={widget}
                  chart={chartMap.get(widget.chartId)}
                  layout={widgetLayout[index]}
                  readOnly={!isEditMode}
                  annotations={annotations.filter((ann) => ann.chartId === widget.chartId)}
                  onRemove={removeWidget}
                  onUpdateWidget={updateWidget}
                  onDragStart={startDrag}
                  onResizeStart={startResize}
                  isDragging={action?.widgetId === widget.id && action?.type === "drag"}
                  isResizing={action?.widgetId === widget.id && action?.type === "resize"}
                  onAddAnnotation={handleAddAnnotation}
                  onUpdateAnnotation={handleUpdateAnnotation}
                  onDeleteAnnotation={handleDeleteAnnotation}
                  onRenderComplete={handleChartRendered}
                />
              ))}
              {widgetLayout.length === 0 ? (
                <div className="dashboard-canvas-empty">
                  <h3>{readOnly ? "This dashboard is empty" : "Build this dashboard"}</h3>
                  <p>
                    {readOnly
                      ? "No charts were added to this dashboard yet."
                      : "Use Add charts, then drag and resize without overlaps."}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {isEditMode && showChartLibrary ? (
        <div className="dashboard-library-drawer-overlay" onClick={() => setShowChartLibrary(false)}>
          <aside className="dashboard-library-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="dashboard-library-drawer-head">
              <h4>Charts Gallery</h4>
              <button type="button" className="dashboard-widget-icon-btn" onClick={() => setShowChartLibrary(false)}>
                <X size={13} />
              </button>
            </div>
            <p>Add a chart to this dashboard</p>
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
        </div>
      ) : null}
    </div>
  );
}
