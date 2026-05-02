import React, { useState, useEffect } from "react";
import { Edit2, Eye, Trash2, Loader2, Download, FileSpreadsheet, FileText } from "lucide-react";
import ChartPreview from "./components/ChartPreview";
import { queryDataset } from "../../services/charts.service";
import { useExportStatus } from "../../hooks/useExportStatus";
import { buildChartRawExportPayload } from "../../services/export.service";
import { canEditChart, canDeleteChart } from "../../core/utils/permissions";

const cardDataCache = new Map();
const cardRequestCache = new Map();

export default function ChartCard({ chart, onDelete, onEdit, onView }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const { status, progress, error: exportError, startExport, download, isBusy, isComplete } = useExportStatus();

  const datasetId = chart.dataSource?.datasetId || chart.datasetId;
  const chartType = chart.visualization?.type || chart.type;
  const query = React.useMemo(() => {
    if (chartType === "scatter" || chartType === "boxplot" || chartType === "histogram") {
      return {
        dimensions: chart.query?.dimensions || [],
        measures: chart.query?.measures || [],
        groupBy: [],
        orderBy: [],
        raw: true,
      };
    }

    return chart.query || {};
  }, [chart.query, chartType]);

  const queryKey = `${chart.chartId || chart._id || chart.name || "chart"}:${datasetId || ""}:${JSON.stringify(query || {})}`;

  useEffect(() => {
    const fetchChartData = async () => {
      setLoading(true);
      try {
        if (!datasetId) {
          setError("No data source found");
          return;
        }

        if (cardDataCache.has(queryKey)) {
          setData(cardDataCache.get(queryKey));
          return;
        }

        let request = cardRequestCache.get(queryKey);
        if (!request) {
          request = queryDataset(datasetId, query).then((results) => results.results || []);
          cardRequestCache.set(queryKey, request);
        }

        const previewData = await request;
        cardRequestCache.delete(queryKey);
        cardDataCache.set(queryKey, previewData);
        setData(previewData);
      } catch (err) {
        setError("Failed to load chart data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [datasetId, queryKey]);

  const handleExport = (format) => {
    const payload = buildChartRawExportPayload({
      chart,
      source: "chart-card",
    });

    startExport("raw", { ...payload, format });
    setShowExportMenu(false);
  };

  return (
    <div className="chart-card">
      <div className="chart-card-header">
        <h4 className="chart-card-title">{chart.name}</h4>
        <div className="chart-card-meta">
          <span>{chart.visualization?.type}</span>
          <span>{new Date(chart.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="chart-card-body">
        {loading ? (
          <div className="chart-loading">
            <Loader2 className="spinner" size={32} />
          </div>
        ) : error ? (
          <div className="chart-error">{error}</div>
        ) : (
          <ChartPreview 
            type={chart.visualization?.type || chart.type}
            data={data}
            dimensions={chart.query?.dimensions?.map(d => d.field || d) || []}
            measures={chart.query?.measures || []}
            style={chart.style}
            binSize={chart.visualization?.binSize}
            stacking={chart.visualization?.series?.stack || false}
          />
        )}
      </div>

      <div className="chart-card-actions">
        <div className="chart-export-container" style={{ position: "relative" }}>
          <button 
            className={`chart-action-btn ${status ? "active" : ""}`} 
            title="Download Data"
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={isBusy}
          >
            {isBusy ? (
              <Loader2 size={16} className="spinner" />
            ) : (
              <Download size={16} />
            )}
          </button>
          
          {showExportMenu && (
            <div className="export-dropdown">
              <button onClick={() => handleExport("csv")}>
                <FileText size={14} /> CSV
              </button>
              <button onClick={() => handleExport("xlsx")}>
                <FileSpreadsheet size={14} /> Excel
              </button>
            </div>
          )}

          {isComplete && (
            <div className="export-success-toast" onClick={download}>
              Download ready
            </div>
          )}
        </div>

        <button className="chart-action-btn" title="View Details" onClick={onView}>
          <Eye size={16} />
        </button>
        {canEditChart(chart) && (
          <button className="chart-action-btn" title="Edit Chart" onClick={onEdit}>
            <Edit2 size={16} />
          </button>
        )}
        {canDeleteChart(chart) && (
          <button 
            className="chart-action-btn danger" 
            onClick={onDelete}
            title="Delete Chart"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {isBusy ? (
        <div className="chart-card-meta" style={{ padding: "0 18px 14px" }}>
          <span>Preparing export</span>
          <span>{Math.max(0, Math.round(progress || 0))}%</span>
        </div>
      ) : null}

      {exportError ? (
        <div className="chart-error" style={{ margin: "0 18px 18px" }}>
          {exportError}
        </div>
      ) : null}
    </div>
  );
}
