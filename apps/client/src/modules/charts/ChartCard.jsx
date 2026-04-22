import React, { useState, useEffect } from "react";
import { Edit2, Eye, Trash2, Loader2, Maximize2, Download, FileSpreadsheet, FileText } from "lucide-react";
import ChartPreview from "./components/ChartPreview";
import { queryDataset } from "../../services/charts.service";
import { useExportStatus } from "../../hooks/useExportStatus";

const cardDataCache = new Map();
const cardRequestCache = new Map();

export default function ChartCard({ chart, onDelete, onEdit, onView }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const { status, progress, startExport, reset } = useExportStatus();

  useEffect(() => {
    const fetchChartData = async () => {
      setLoading(true);
      try {
        const datasetId = chart.dataSource?.datasetId || chart.datasetId;
        if (!datasetId) {
          setError("No data source found");
          return;
        }

        const chartType = chart.visualization?.type || chart.type;
        const isScatter = chartType === "scatter";
        const isDistribution = chartType === "boxplot" || chartType === "histogram";
        let query;
        if (isScatter || isDistribution) {
          // Scatter and Distribution charts need raw individual records, not aggregated data
          query = {
            dimensions: chart.query?.dimensions || [],
            measures: chart.query?.measures || [],
            groupBy: [],
            orderBy: [],
            raw: true
          };
        } else {
          query = chart.query;
        }

        const cacheKey = `${chart.chartId || chart._id || chart.name || "chart"}:${JSON.stringify(query || {})}`;

        if (cardDataCache.has(cacheKey)) {
          setData(cardDataCache.get(cacheKey));
          return;
        }

        let request = cardRequestCache.get(cacheKey);
        if (!request) {
          request = queryDataset(datasetId, query).then((results) => results.results || []);
          cardRequestCache.set(cacheKey, request);
        }

        const previewData = await request;
        cardRequestCache.delete(cacheKey);
        cardDataCache.set(cacheKey, previewData);
        setData(previewData);
      } catch (err) {
        setError("Failed to load chart data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [chart]);

  const handleExport = (format) => {
    const datasetId = chart.dataSource?.datasetId || chart.datasetId;
    const context = {
      selectedDimensions: chart.query?.dimensions?.map(d => d.field || d) || [],
      selectedMeasures: chart.query?.measures?.map(m => m.field || m) || [],
      filters: chart.query?.filters || {},
      groupBy: chart.query?.groupBy || [],
      sort: chart.query?.orderBy || []
    };

    startExport("raw", { datasetId, format, context });
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
            disabled={status === "processing" || status === "initiating"}
          >
            {status === "processing" || status === "initiating" ? (
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
              <button onClick={() => handleExport("excel")}>
                <FileSpreadsheet size={14} /> Excel
              </button>
            </div>
          )}

          {status === "completed" && (
            <div className="export-success-toast" onClick={reset}>
              ✓ Ready
            </div>
          )}
        </div>

        <button className="chart-action-btn" title="View Details" onClick={onView}>
          <Eye size={16} />
        </button>
        <button className="chart-action-btn" title="Edit Chart" onClick={onEdit}>
          <Edit2 size={16} />
        </button>
        <button 
          className="chart-action-btn danger" 
          onClick={onDelete}
          title="Delete Chart"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
