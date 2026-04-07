import React, { useState, useEffect, useRef } from "react";
import { Plus, Save, ArrowLeft, RefreshCw, Trash2, Edit3 } from "lucide-react";
import ChartPreview from "../../charts/components/ChartPreview";
import ChartPickerModal from "./ChartPickerModal";
import AnnotationOverlay from "./AnnotationOverlay";

export default function DashboardBuilder({ dashboard, onBack, onSave }) {
  const [layout, setLayout] = useState(dashboard.layout || []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState(null);
  const [annotatingIndex, setAnnotatingIndex] = useState(null);
  
  const tileRefs = useRef(new Map());

  useEffect(() => {
    const observers = [];
    tileRefs.current.forEach((el) => {
      if (!el) return;
      const ro = new ResizeObserver(() => {
        const canvas = el.querySelector('canvas');
        if (!canvas) return;
        window.dispatchEvent(new Event('resize'));
      });
      ro.observe(el);
      observers.push(ro);
    });
    return () => observers.forEach(ro => ro.disconnect());
  }, [layout]);

  const handleAddChart = (chart) => {
    const newTile = { chartId: chart._id || chart.id, chartData: chart, position: null, annotations: [] };
    setLayout([...layout, newTile]);
  };

  const handleReplaceChart = (chart) => {
    if (replaceIndex === null) return;
    const newLayout = [...layout];
    newLayout[replaceIndex] = { ...newLayout[replaceIndex], chartId: chart._id || chart.id, chartData: chart };
    setLayout(newLayout);
    setReplaceIndex(null);
  };

  const handleRemoveChart = (index) => {
    if (window.confirm("Are you sure you want to remove this chart?")) {
      setLayout(layout.filter((_, i) => i !== index));
    }
  };

  const handleAddAnnotation = (index, annotation) => {
    const newLayout = [...layout];
    const item = { ...newLayout[index] };
    item.annotations = [...(item.annotations || []), annotation];
    newLayout[index] = item;
    setLayout(newLayout);
  };

  const handleDeleteAnnotation = (index, annotationIndex) => {
    const newLayout = [...layout];
    const item = { ...newLayout[index] };
    item.annotations = item.annotations.filter((_, i) => i !== annotationIndex);
    newLayout[index] = item;
    setLayout(newLayout);
  };

  const handleSaveBtn = () => {
    onSave({ ...dashboard, layout });
  };

  return (
    <div className="dashboard-builder" style={{ padding: "24px", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button onClick={onBack} style={{ background: "transparent", border: "none", color: "var(--text-color, #f8fafc)", cursor: "pointer", display: "flex", alignItems: "center" }}>
            <ArrowLeft size={20} />
          </button>
          <h2>{dashboard.title}</h2>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => { setReplaceIndex(null); setPickerOpen(true); }}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", borderRadius: "6px", border: "1px solid #334155", background: "transparent", color: "#f8fafc", cursor: "pointer" }}
          >
            <Plus size={16} /> Add Chart
          </button>
          <button
            onClick={handleSaveBtn}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", borderRadius: "6px", border: "none", background: "#4f46e5", color: "#fff", cursor: "pointer" }}
          >
            <Save size={16} /> Save Dashboard
          </button>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "24px",
        gridAutoRows: "350px",
        flex: 1,
        overflowY: "auto"
      }}>
        {layout.map((item, i) => (
          <div key={i} style={{ position: "relative", background: "#1e293b", borderRadius: "8px", padding: "16px", border: "1px solid #334155", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#f8fafc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.chartData?.name || "Untitled Chart"}
              </h4>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  onClick={() => setAnnotatingIndex(annotatingIndex === i ? null : i)}
                  style={{ background: annotatingIndex === i ? "rgba(99, 102, 241, 0.2)" : "transparent", border: "none", color: annotatingIndex === i ? "#818cf8" : "#94a3b8", cursor: "pointer", padding: "4px", borderRadius: "4px" }}
                  title="Annotate"
                >
                  <Edit3 size={14} />
                </button>
                <div style={{ width: "1px", height: "16px", backgroundColor: "#334155" }} />
                <button
                  onClick={() => { setReplaceIndex(i); setPickerOpen(true); }}
                  style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px" }}
                  title="Replace"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={() => handleRemoveChart(i)}
                  style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", padding: "4px" }}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            
            <div 
              style={{ flex: 1, minHeight: 0, position: "relative" }}
              ref={(el) => {
                if (el) tileRefs.current.set(i, el);
                else tileRefs.current.delete(i);
              }}
            >
              <ChartPreview 
                type={item.chartData?.visualization?.type || "bar"}
                dimensions={item.chartData?.query?.dimensions?.map(d => d.field || d) || []}
                measures={item.chartData?.query?.measures || []}
                style={item.chartData?.style || {}}
                data={[]}
                annotations={item.annotations || []}
              />
              <AnnotationOverlay
                annotations={item.annotations || []}
                isActive={annotatingIndex === i}
                onAdd={(ann) => handleAddAnnotation(i, ann)}
                onDelete={(annIdx) => handleDeleteAnnotation(i, annIdx)}
              />
            </div>
          </div>
        ))}
        {layout.length === 0 && (
          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#64748b", height: "100%" }}>
            <p>No charts added yet.</p>
            <button
               onClick={() => { setReplaceIndex(null); setPickerOpen(true); }}
               style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", borderRadius: "6px", border: "1px solid #334155", background: "transparent", color: "#f8fafc", cursor: "pointer" }}
            >
              <Plus size={16} /> Add your first chart
            </button>
          </div>
        )}
      </div>

      <ChartPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={replaceIndex !== null ? handleReplaceChart : handleAddChart}
      />
    </div>
  );
}
