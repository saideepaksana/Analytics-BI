import React, { useState, useEffect } from "react";
import { Edit2, Eye, Trash2, Loader2, Maximize2 } from "lucide-react";
import ChartPreview from "./components/ChartPreview";
import { queryDataset } from "../../services/charts.service";

export default function ChartCard({ chart, onDelete, onEdit, onView }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
        let query;
        if (isScatter) {
          // Scatter needs raw individual records, not aggregated data
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

        const results = await queryDataset(datasetId, query);
        setData(results.results || []);
      } catch (err) {
        setError("Failed to load chart data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [chart]);

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
          />
        )}
      </div>

      <div className="chart-card-actions">
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
