import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Grip, Loader2, MoveDiagonal2, Pencil, Plus, PlusCircle, Save, Trash2, X, MoreVertical, Star, User, Clock, MessageSquare, Download, FileSpreadsheet, FileText as PdfIcon, Send, FileEdit, History } from "lucide-react";
import html2canvas from "html2canvas";
import { useExportStatus } from "../../../hooks/useExportStatus";
import { buildChartQueryForExport, buildChartRawExportPayload, mergeNormalizedFilters } from "../../../services/export.service";
import ChartPreview from "../../charts/components/ChartPreview";
import { queryDataset } from "../../../services/charts.service";
import * as annotationsService from "../../../services/annotations.service";
import { canEditDashboard, canPublishDashboard } from "../../../core/utils/permissions";
import { saveDraft as saveDraftService, publishDashboard as publishDashboardService } from "../../../services/dashboard.service";
import ScheduleExportModal from "./ScheduleExportModal";
import ExportHistoryModal from "./ExportHistoryModal";

const ROW_HEIGHT = 42;
const MIN_WIDGET_W = 4;
const MIN_WIDGET_H = 5;



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

const buildChartQuery = (chart, dashboardFilters = []) => {
  const baseQuery = buildChartQueryForExport({ chart });

  if (baseQuery.dimensions.length === 0 && baseQuery.measures.length === 0) {
    return {
      ...baseQuery,
      dimensions: getDimensionsFromChart(chart),
      measures: getMeasuresFromChart(chart),
      filters: mergeNormalizedFilters(chart?.query?.filters, dashboardFilters),
    };
  }

  return {
    ...baseQuery,
    filters: mergeNormalizedFilters(baseQuery.filters, dashboardFilters),
  };
};

const getFrozenExportState = () => {
  if (typeof window === "undefined" || !window.IS_EXPORT_MODE) {
    return { state: null, error: null };
  }

  try {
    // Bug 4 Fix: Prefer window.__EXPORT_STATE__ (no size limit) over localStorage
    if (window.__EXPORT_STATE__) {
      return { state: window.__EXPORT_STATE__, error: null };
    }
    const stored = localStorage.getItem("export_frozen_state");
    return {
      state: stored ? JSON.parse(stored) : null,
      error: null,
    };
  } catch (error) {
    return { state: null, error };
  }
};

function DashboardWidgetChart({ chart, dashboardFilters = [], onRenderComplete, title }) {
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

        // Bug 1 Fix: If in export mode, use pre-fetched data from window.__EXPORT_STATE__
        if (window.IS_EXPORT_MODE && window.__EXPORT_STATE__?.chartDataCache) {
          const chartId = chart.chartId || chart._id;
          const cachedData = window.__EXPORT_STATE__.chartDataCache[chartId];
          if (cachedData) {
            if (!cancelled) {
              setData(cachedData);
              setLoading(false);
            }
            return;
          }
        }

        const query = buildChartQuery(chart, dashboardFilters);
        const results = await queryDataset(datasetId, query).then((response) => response.results || []);

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
  }, [chart?.chartId, chart?._id, chart?.id, chart?.dataSource?.datasetId, chart?.datasetId, chart?.type, chart?.visualization?.type, chart?.query, dashboardFilters]);

  if (loading) {
    return (
      <div className="dashboard-widget-skeleton">
        <Loader2 size={24} className="spinner" />
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
      title={title}
      onRenderComplete={onRenderComplete}
    />
  );
}

function DashboardWidget({
  widget,
  chart,
  layout,
  readOnly,
  isEmbed = false,
  dashboardFilters = [],
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
  onViewPopup,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [isEditingAnnotation, setIsEditingAnnotation] = useState(false);
  const [annotationToEdit, setAnnotationToEdit] = useState(null);
  const [tempAnnotation, setTempAnnotation] = useState("");
  const {
    progress: exportProgress,
    error: exportError,
    startExport,
    download,
    isBusy: isExportBusy,
    isComplete: isExportComplete,
  } = useExportStatus();

  const style = {
    left: `${layout.left}px`,
    top: `${layout.top}px`,
    width: `${layout.width}px`,
    height: `${layout.height}px`,
  };

  const activeClass = isDragging ? "is-dragging" : isResizing ? "is-resizing" : "";
  const showWidgetActions = !isEmbed && !readOnly;

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

  const handleExport = (format) => {
    if (!chart) {
      return;
    }

    const payload = buildChartRawExportPayload({
      chart,
      chartId: widget.chartId,
      chartName: widget.title || chart?.name,
      dashboardFilters,
      source: "dashboard-widget",
    });

    startExport("raw", { ...payload, format });
    setShowMenu(false);
  };

  return (
    <article 
      className={`dashboard-widget ${activeClass}`} 
      style={style}
      onClick={() => {
        if (readOnly && onViewPopup) onViewPopup(widget.id);
      }}
    >
      <header
        className={`dashboard-widget-header ${readOnly ? "read-only" : ""}`}
        style={readOnly && onViewPopup ? { cursor: "pointer" } : undefined}
        onMouseDown={(event) => {
          if (readOnly) return;
          onDragStart(event, widget.id);
        }}
      >
        <div className="dashboard-widget-title-wrap">
          {!readOnly && <Grip size={14} className="dashboard-widget-drag-handle" />}
        </div>
        {showWidgetActions ? (
          <div className="dashboard-widget-actions">
            <div style={{ position: "relative", display: "inline-block" }}>
              <button
                type="button"
                className="dashboard-widget-icon-btn action"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                title={readOnly ? "Export chart data" : "Menu"}
                disabled={isExportBusy}
              >
                {isExportBusy ? <Loader2 size={13} className="spinner" /> : <MoreVertical size={13} />}
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
                    minWidth: "148px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                  }}
                >
                  {chart ? (
                    <>
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
                          handleExport("csv");
                        }}
                      >
                        <Download size={12} />
                        Export CSV
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
                          handleExport("xlsx");
                        }}
                      >
                        <FileSpreadsheet size={12} />
                        Export Excel
                      </button>
                    </>
                  ) : null}
                  {!readOnly ? (
                    <>
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
                    </>
                  ) : null}
                </div>
              )}
            </div>
            {!readOnly ? (
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
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="dashboard-widget-body">
        {chart ? (
          <DashboardWidgetChart
            chart={chart}
            dashboardFilters={dashboardFilters}
            onRenderComplete={onRenderComplete}
            title={widget.title || chart?.name}
          />
        ) : (
          <div className="dashboard-widget-error">Chart not found</div>
        )}
      </div>

      {!readOnly ? (
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

          {isExportBusy ? (
            <div className="dashboard-widget-annotation" style={{ opacity: 0.86 }}>
              <p>Preparing export... {Math.max(0, Math.round(exportProgress || 0))}%</p>
            </div>
          ) : null}

          {isExportComplete ? (
            <div className="dashboard-widget-annotation" style={{ cursor: "pointer" }} onClick={download}>
              <p>Download ready</p>
            </div>
          ) : null}

          {exportError ? (
            <div className="dashboard-widget-annotation">
              <p>{exportError}</p>
            </div>
          ) : null}
        </div>
      ) : null}

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

export default function DashboardEditor({ mode, dashboard, charts, saving, saveError, onClearSaveError, onBack, onSave, onAutoSave, onPublish, onUnpublish, isEmbed = false }) {
  const frozenExportState = useMemo(() => getFrozenExportState(), []);
  const frozenState = frozenExportState.state;
  const isNewOrEmpty = !dashboard?.id || (Array.isArray(dashboard?.widgets) && dashboard.widgets.length === 0);
  const [isEditMode, setIsEditMode] = useState(() => (isEmbed ? false : mode === "edit" || isNewOrEmpty));
  const readOnly = !isEditMode;
  const [publishingLocal, setPublishingLocal] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedMsg, setDraftSavedMsg] = useState(null);
  const [name, setName] = useState(() => (
    typeof frozenState?.dashboardName === "string" && frozenState.dashboardName.trim()
      ? frozenState.dashboardName
      : dashboard?.name || "Untitled Dashboard"
  ));
  const [description, setDescription] = useState(() => (
    typeof frozenState?.description === "string" 
      ? frozenState.description 
      : dashboard?.description || ""
  ));
  const [savingLocal, setSavingLocal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showExportHistoryModal, setShowExportHistoryModal] = useState(false);
  const {
    status,
    progress: exportProgress,
    error: exportError,
    startExport,
    download,
    isBusy: isVisualExportBusy,
    isComplete: isVisualExportComplete,
  } = useExportStatus();
  const [tabs, setTabs] = useState(() => {
    if (Array.isArray(frozenState?.tabs)) return frozenState.tabs;
    if (Array.isArray(dashboard?.tabs) && dashboard.tabs.length > 0) return dashboard.tabs;

    const legacyWidgets = Array.isArray(frozenState?.visibleSection?.widgets)
      ? frozenState.visibleSection.widgets
      : Array.isArray(dashboard?.widgets) && dashboard.widgets.length > 0
      ? dashboard.widgets
      : Array.isArray(dashboard?.layout)
      ? dashboard.layout
      : [];

    return [
      {
        id: frozenState?.visibleSection?.id || dashboard?.activeSectionId || `tab-${Date.now()}`,
        name: frozenState?.visibleSection?.name || "Main Tab",
        widgets: legacyWidgets,
      },
    ];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    if (frozenState?.activeTab) return frozenState.activeTab;
    return dashboard?.activeTabId || (tabs[0]?.id);
  });

  const [editingTabId, setEditingTabId] = useState(null);
  const [tempTabName, setTempTabName] = useState("");

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);
  const widgets = activeTab?.widgets || [];

  const setWidgets = useCallback(
    (updater) => {
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id === activeTabId) {
            const nextWidgets = typeof updater === "function" ? updater(t.widgets) : updater;
            return { ...t, widgets: nextWidgets };
          }
          return t;
        })
      );
    },
    [activeTabId]
  );
  const [annotations, setAnnotations] = useState(() => (
    Array.isArray(frozenState?.annotations) ? frozenState.annotations : []
  ));
  const hasFrozenAnnotationsRef = useRef(Array.isArray(frozenState?.annotations));
  const [filters, setFilters] = useState(() => (
    frozenState?.filters || dashboard?.filters || {}
  ));
  const [popupWidgetId, setPopupWidgetId] = useState(null);

  useEffect(() => {
    if (isEmbed && isEditMode) {
      setIsEditMode(false);
    }
  }, [isEmbed, isEditMode]);

  useEffect(() => {
    if (!window.IS_EXPORT_MODE && dashboard?.filters) {
      setFilters(dashboard.filters);
    }
  }, [dashboard?.filters]);

  const visibleSection = useMemo(() => ({
    id: activeTab?.id,
    name: activeTab?.name || "Untitled Section",
    widgets,
  }), [activeTab, widgets]);

  // Apply frozen state in export mode
  const [, setRenderedCount] = useState(0);
  
  useEffect(() => {
    window.RENDER_COMPLETE = false;

    if (frozenExportState.error) {
      console.error("Failed to apply frozen state", frozenExportState.error);
      window.RENDER_COMPLETE = true;
    }
  }, [frozenExportState.error]);

  useEffect(() => {
    if (window.IS_EXPORT_MODE) {
      setRenderedCount(0);
      window.RENDER_COMPLETE = false;
      console.log("[Export] Tab changed, waiting for new charts...");
    }
  }, [activeTabId]);

  const widgetsCountRef = useRef(widgets.length);
  useEffect(() => {
    widgetsCountRef.current = widgets.length;
  }, [widgets.length]);

  const handleChartRendered = useCallback(() => {
    if (!window.IS_EXPORT_MODE) return;
    
    setRenderedCount(prev => {
        const next = prev + 1;
        // Bug 9 Fix: Use ref to avoid stale closure capture of widgets.length
        if (next >= widgetsCountRef.current) {
            window.RENDER_COMPLETE = true;
            console.log("[Export] All charts rendered. Signal sent.");
        }
        return next;
    });
  }, []); // Remove widgets.length dependency as we use ref now

  useEffect(() => {
    if (!dashboard?.id || isEmbed) {
      return;
    }
    if (window.IS_EXPORT_MODE && hasFrozenAnnotationsRef.current) {
      return;
    }
    annotationsService.getAnnotationsByDashboard(dashboard.id).then(setAnnotations);
  }, [dashboard?.id, isEmbed]);

  useEffect(() => {
    if (window.IS_EXPORT_MODE && widgets.length === 0) {
      window.RENDER_COMPLETE = true;
    }
  }, [widgets.length]);

  const handleAddAnnotation = async (chartId, text) => {
    if (isEmbed) return;
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
    if (isEmbed) return;
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
    if (isEmbed) return;
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
    description: dashboard?.description || "",
    tabs: JSON.stringify(tabs || []),
    activeTabId: activeTabId || "",
  });

  // Check for meaningful changes in layout or metadata
  const hasChanges = useCallback(() => {
    const currentTabsJson = JSON.stringify(tabs || []);
    return (
      name !== lastStateRef.current.name ||
      description !== lastStateRef.current.description ||
      currentTabsJson !== lastStateRef.current.tabs ||
      activeTabId !== lastStateRef.current.activeTabId
    );
  }, [name, description, tabs, activeTabId]);

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
        description: description.trim(),
        tabs,
        activeTabId,
      });
      lastStateRef.current = {
        name: name.trim(),
        description: description.trim(),
        tabs: JSON.stringify(tabs),
        activeTabId,
      };
    }, 2000);

    return () => clearTimeout(timer);
  }, [name, widgets, tabs, activeTabId, isEditMode, dashboard?.id, onAutoSave, hasChanges, validateLayout]);

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

  const popupWidget = useMemo(
    () => widgets.find((widget) => widget.id === popupWidgetId) || null,
    [widgets, popupWidgetId]
  );

  const popupChart = useMemo(() => {
    if (!popupWidget) return null;
    return chartMap.get(popupWidget.chartId) || null;
  }, [chartMap, popupWidget]);

  const popupAnnotations = useMemo(() => {
    if (!popupWidget) return [];
    return annotations.filter((ann) => ann.chartId === popupWidget.chartId);
  }, [annotations, popupWidget]);

  useEffect(() => {
    if (isEditMode && popupWidgetId) {
      setPopupWidgetId(null);
    }
  }, [isEditMode, popupWidgetId]);

  useEffect(() => {
    if (popupWidgetId && !popupWidget) {
      setPopupWidgetId(null);
    }
  }, [popupWidgetId, popupWidget]);

  useEffect(() => {
    if (!popupWidgetId) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setPopupWidgetId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [popupWidgetId]);

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
  }, [baseColumns, setWidgets]);

  const removeWidget = useCallback((widgetId) => {
    setWidgets((previous) => previous.filter((widget) => widget.id !== widgetId));
  }, [setWidgets]);

  const updateWidget = useCallback((widgetId, updates) => {
    setWidgets((previous) =>
      previous.map((widget) => (widget.id === widgetId ? { ...widget, ...updates } : widget))
    );
  }, [setWidgets]);

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
  }, [action, cellWidth, baseColumns, isEditMode, widgets]);

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
    onClearSaveError?.();
    setSavingLocal(true);
    let thumbnail = dashboard?.thumbnail || null;

    const error = validateLayout();
    if (error) {
      alert(error);
      setSavingLocal(false);
      return;
    }

    const firstTabId = tabs && tabs.length > 0 ? tabs[0].id : null;
    const originalTabId = activeTabId;
    const isFirstTab = activeTabId === firstTabId;

    try {
      window.DISABLE_CHART_ANIMATIONS = true;

      // Force a tiny redraw
      await new Promise(r => setTimeout(r, 50));

      if (!isFirstTab && firstTabId) {
        setActiveTabId(firstTabId);
        // Wait for React to switch tab
        await new Promise(r => setTimeout(r, 100)); 
      }

      const gridEl = document.querySelector(".dashboard-canvas-grid");
      if (gridEl) {
        // Wait for all chart loading skeletons to disappear (max 10 seconds)
        let retries = 100;
        while (gridEl.querySelector(".dashboard-widget-skeleton") && retries > 0) {
          await new Promise(r => setTimeout(r, 100));
          retries--;
        }

        // Wait a bit more for echarts to finish canvas animations if any are still lingering
        await new Promise(r => setTimeout(r, 800)); 

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
    } finally {
      window.DISABLE_CHART_ANIMATIONS = false;
    }

    if (!isFirstTab && firstTabId) {
      // Return to original tab to preserve editor state smoothly if expected
      setActiveTabId(originalTabId);
    }

    try {
      await onSave({
        id: dashboard?.id,
        name: name.trim(),
        description: description.trim(),
        tabs,
        activeTabId,
        thumbnail
      });

      lastStateRef.current = {
        name: name.trim(),
        description: description.trim(),
        tabs: JSON.stringify(tabs),
        activeTabId,
      };
    } catch (err) {
      console.error("Error saving dashboard:", err);
    } finally {
      setSavingLocal(false);
    }
  };

  const handleExport = (format) => {
    // Capture full frozen state including all tabs
    const exportedSection = activeTab
      ? {
          id: activeTab.id || null,
          name: activeTab.name || "Untitled Section",
          widgets: Array.isArray(activeTab.widgets) ? activeTab.widgets : [],
        }
      : {
          id: null,
          name: "Untitled Section",
          widgets: [],
        };

    const frozenState = {
      tabs,
      activeTab: activeTabId,
      visibleSection: exportedSection,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      dashboardName: name.trim(),
      description: description.trim(),
      annotations,
      filters,
    };

    startExport("visual", { 
      dashboardId: dashboard.id, 
      format, 
      frozenState 
    });
    setShowExportMenu(false);
  };

  const isSaving = saving || savingLocal;

  /** Save current content as draft without publishing */
  const handleSaveDraft = async () => {
    if (!dashboard?.id) return;
    setSavingDraft(true);
    try {
      const draftContent = {
        name: name.trim(),
        description: description.trim(),
        tabs,
        activeTabId,
      };
      await saveDraftService(dashboard.id, draftContent);
      setDraftSavedMsg('Draft saved!');
      setTimeout(() => setDraftSavedMsg(null), 3000);
    } catch (err) {
      console.error('Failed to save draft', err);
    } finally {
      setSavingDraft(false);
    }
  };

  /** Publish the current dashboard */
  const handlePublish = async () => {
    if (!dashboard?.id) return;
    // First save the current state as draft then publish
    setPublishingLocal(true);
    try {
      await saveDraftService(dashboard.id, { name: name.trim(), description: description.trim(), tabs, activeTabId });
      const published = await publishDashboardService(dashboard.id);
      onPublish?.(published);
      setDraftSavedMsg('Published!');
      setTimeout(() => setDraftSavedMsg(null), 3000);
    } catch (err) {
      console.error('Failed to publish dashboard', err);
    } finally {
      setPublishingLocal(false);
    }
  };

  return (
    <div className="dashboard-editor-page">
      <div className="dashboard-editor-topbar">
        <div className="dashboard-editor-title-row">
          {!isEmbed ? (
            <button type="button" className="dashboard-topbar-back-btn" onClick={onBack} title="Back">
              <ArrowLeft size={18} />
            </button>
          ) : null}

          {isEditMode ? (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: "4px" }}>
              <input
                type="text"
                className="dashboard-name-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Dashboard name"
                style={{ fontSize: "18px", fontWeight: "600" }}
              />
              <input
                type="text"
                className="dashboard-name-input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add a description or summary..."
                style={{ fontSize: "13px", opacity: 0.7, fontWeight: "400" }}
              />
            </div>
          ) : (
            <div className="dashboard-superset-title-group">
              <h1 className="dashboard-superset-title">{name}</h1>
              {description && (
                <p style={{ fontSize: "13px", opacity: 0.6, marginTop: "4px", maxWidth: "600px" }}>
                  {description}
                </p>
              )}
            </div>
          )}
        </div>

        {!isEmbed ? (
          <div className="dashboard-editor-actions">
            {!isEditMode ? (
              <>
                {/* Draft indicator badge in view mode */}
                {dashboard?.status === 'draft' && (
                  <span style={{
                    fontSize: '11px',
                    padding: '3px 10px',
                    borderRadius: '4px',
                    background: 'rgba(245,158,11,0.18)',
                    color: '#f59e0b',
                    fontWeight: 600,
                    border: '1px solid rgba(245,158,11,0.3)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}>DRAFT</span>
                )}
                {canEditDashboard(dashboard) && (
                  <button type="button" className="dashboard-primary-btn" onClick={() => setIsEditMode(true)}>
                    Edit dashboard
                  </button>
                )}
                
                <div className="dashboard-export-wrapper" style={{ position: "relative" }}>
                  <button 
                    type="button" 
                    className={`dashboard-secondary-btn ${status ? "active" : ""}`} 
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    disabled={isVisualExportBusy}
                  >
                    {isVisualExportBusy ? (
                      <Loader2 size={14} className="spinner" />
                    ) : (
                      <>
                        <Download size={14} />
                        Export
                      </>
                    )}
                  </button>

                  {showExportMenu && (
                    <div className="export-dropdown" style={{ top: "calc(100% + 8px)", bottom: "auto", left: "auto", right: 0 }}>
                      <button onClick={() => handleExport("pdf")}>
                        <PdfIcon size={14} /> PDF Document
                      </button>
                      <button onClick={() => {
                        setShowExportMenu(false);
                        setShowScheduleModal(true);
                      }}>
                        <Clock size={14} /> Schedule Delivery
                      </button>
                      <button onClick={() => {
                        setShowExportMenu(false);
                        setShowExportHistoryModal(true);
                      }}>
                        <History size={14} /> Export History
                      </button>
                    </div>
                  )}

                  {isVisualExportComplete && (
                    <div className="export-success-toast" style={{ top: "calc(100% + 8px)", bottom: "auto", left: "auto", right: 0 }} onClick={download}>
                      Download ready
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
                {/* Save Draft button – available for existing dashboards */}
                {dashboard?.id && (
                  <button
                    type="button"
                    className="dashboard-secondary-btn"
                    onClick={handleSaveDraft}
                    disabled={savingDraft}
                    title="Save current state as draft (not published)"
                  >
                    {savingDraft ? <Loader2 size={14} className="spinner" /> : <FileEdit size={14} />}
                    {savingDraft ? 'Saving...' : 'Save Draft'}
                  </button>
                )}
                <div className="dashboard-save-action">
                  <button type="button" className="dashboard-primary-btn" onClick={submitSave} disabled={isSaving}>
                    {isSaving ? <Loader2 size={14} className="spinner" /> : 'Save'}
                  </button>
                  {saveError ? (
                    <div className="dashboard-save-error" role="status">
                      {saveError}
                    </div>
                  ) : null}
                </div>
                {/* Publish button – available for editors/owners with a saved dashboard */}
                {dashboard?.id && canPublishDashboard(dashboard) && dashboard?.status !== 'published' && (
                  <button
                    type="button"
                    className="dashboard-primary-btn"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    onClick={handlePublish}
                    disabled={publishingLocal}
                    title="Publish this dashboard to make it visible to all users"
                  >
                    {publishingLocal ? <Loader2 size={14} className="spinner" /> : <Send size={14} />}
                    {publishingLocal ? 'Publishing...' : 'Publish'}
                  </button>
                )}
                <button type="button" className="dashboard-secondary-btn discard" onClick={() => setIsEditMode(false)}>
                  Discard
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="dashboard-tabs-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`dashboard-tab-item ${tab.id === activeTabId ? "active" : ""}`}
            onClick={() => setActiveTabId(tab.id)}
            onDoubleClick={() => {
              if (!isEditMode) return;
              setEditingTabId(tab.id);
              setTempTabName(tab.name || "");
            }}
          >
            {editingTabId === tab.id ? (
              <input
                autoFocus
                className="dashboard-tab-input"
                value={tempTabName}
                onChange={(e) => setTempTabName(e.target.value)}
                onBlur={() => {
                  setTabs(tabs.map(t => t.id === tab.id ? { ...t, name: tempTabName.trim() || t.name } : t));
                  setEditingTabId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                      setTabs(tabs.map(t => t.id === tab.id ? { ...t, name: tempTabName.trim() || t.name } : t));
                      setEditingTabId(null);
                  }
                }}
              />
            ) : (
              <span>{tab.name || `Tab ${tab.id}`}</span>
            )}
            {isEditMode && tabs.length > 1 && (
              <button
                type="button"
                className="dashboard-tab-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  const newTabs = tabs.filter(t => t.id !== tab.id);
                  setTabs(newTabs);
                  if (activeTabId === tab.id) {
                      setActiveTabId(newTabs[0].id);
                  }
                }}
                title="Remove Tab"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        {isEditMode && (
          <button
            type="button"
            className="dashboard-tab-add-btn"
            onClick={() => {
              const newId = `tab-${Date.now()}`;
              setTabs([...tabs, { id: newId, name: `New Tab`, widgets: [] }]);
              setActiveTabId(newId);
            }}
            title="Add new tab"
          >
            <Plus size={14} />
          </button>
        )}
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
                  isEmbed={isEmbed}
                  dashboardFilters={filters}
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
                  onViewPopup={!isEditMode ? setPopupWidgetId : undefined}
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

      {!isEditMode && popupWidgetId ? (
        <div className="dashboard-view-overlay" onClick={() => setPopupWidgetId(null)}>
          <div className="dashboard-view-modal" onClick={(event) => event.stopPropagation()}>
            <div className="dashboard-view-header">
              <div>
                <h3>{popupWidget?.title || popupChart?.name || "Chart Preview"}</h3>
                <p>{popupChart?.visualization?.type || popupChart?.type || "chart"}</p>
              </div>
              <button
                type="button"
                className="dashboard-view-close"
                onClick={() => setPopupWidgetId(null)}
                aria-label="Close popup"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="dashboard-view-content">
              {popupChart ? (
                <DashboardWidgetChart chart={popupChart} dashboardFilters={filters} />
              ) : (
                <div className="dashboard-widget-error">Chart not found</div>
              )}
            </div>

            {popupAnnotations.length > 0 ? (
              <div className="dashboard-view-annotations">
                {popupAnnotations.map((ann) => (
                  <p key={ann._id}>{ann.text}</p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

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

      {isVisualExportBusy ? (
        <div className="export-success-toast" style={{ right: 24, bottom: 24, left: "auto" }}>
          Preparing dashboard export... {Math.max(0, Math.round(exportProgress || 0))}%
        </div>
      ) : null}

      {exportError ? (
        <div className="export-success-toast" style={{ right: 24, bottom: 24, left: "auto", background: "rgba(127, 29, 29, 0.92)" }}>
          {exportError}
        </div>
      ) : null}
      {showScheduleModal && (
        <ScheduleExportModal 
          dashboardId={dashboard.id} 
          dashboardName={name}
          onClose={() => setShowScheduleModal(false)} 
        />
      )}
      {showExportHistoryModal && (
        <ExportHistoryModal 
          dashboardId={dashboard.id} 
          onClose={() => setShowExportHistoryModal(false)}
          onRestoreState={(restoredState) => {
            if (restoredState.tabs) setTabs(restoredState.tabs);
            if (restoredState.activeTab) setActiveTabId(restoredState.activeTab);
            if (restoredState.filters) setFilters(restoredState.filters);
          }}
        />
      )}
    </div>
  );
}