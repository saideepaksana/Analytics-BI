import React from "react";
import { Hash, Type, Calendar, CheckCircle2, Info } from "lucide-react";

export default function DimensionMeasureSelector({ 
  availableColumns = [], 
  dimensions = [], 
  measures = [], 
  chartType = "bar",
  validationError = null,
  onMoveToDimension, 
  onMoveToMeasure, 
  onRemove 
}) {
  const getIcon = (type = "") => {
    const t = type.toLowerCase();
    if (t.includes("int") || t.includes("float") || t.includes("number") || t.includes("decimal")) return <Hash size={14} />;
    if (t.includes("date") || t.includes("time")) return <Calendar size={14} />;
    return <Type size={14} />;
  };

  const isAssigned = (colName) => dimensions.includes(colName) || measures.includes(colName);
  
  const getRequirementHint = () => {
    switch (chartType) {
      case "pie": return "Pie charts need 1 Dimension (Category) and 1 Measure (Value).";
      case "scatter": return "Scatter plots need exactly 2 Measures for X and Y axes.";
      case "bar":
      case "line":
      case "area": return "Add at least 1 Dimension and 1 Measure.";
      default: return "";
    }
  };

  const getRoleLabels = () => {
    switch (chartType) {
      case "pie": return { dim: "Sector Category", meas: "Slice Value" };
      case "scatter": return { dim: "Point Label (Optional)", meas: "X & Y Measures" };
      case "bar":
      case "line":
      case "area": return { dim: "X-Axis Category", meas: "Y-Axis Value" };
      default: return { dim: "Dimensions", meas: "Measures" };
    }
  };

  const labels = getRoleLabels();
  const isDimInvalid = (chartType === "pie" && dimensions.length > 1);
  const isMeasInvalid = (chartType === "scatter" && measures.length > 2);

  return (
    <div className="selector-container">
      <div className="requirement-hint">
        <Info size={16} />
        <span>{getRequirementHint()}</span>
      </div>

      <div className="selector-main">
        <div className="selector-column available-fields">
          <h4>Available Fields</h4>
          <div className="fields-pool">
            {availableColumns.map((col) => (
              <div key={col.name} className={`field-pill ${isAssigned(col.name) ? "assigned" : ""}`}>
                <span className="field-icon">{getIcon(col.type)}</span>
                <span className="field-name">{col.name}</span>
                {!isAssigned(col.name) && (
                  <div className="field-actions">
                    <button title="As Dimension" onClick={() => onMoveToDimension(col.name)}>D</button>
                    <button title="As Measure" onClick={() => onMoveToMeasure(col.name)}>M</button>
                  </div>
                )}
                {isAssigned(col.name) && <CheckCircle2 size={14} className="assigned-check" />}
              </div>
            ))}
          </div>
        </div>

        <div className="selector-column role-assignments">
          <div className="role-group dimension-group">
            <h4>{labels.dim}</h4>
            <div className={`role-pool blue-zone ${isDimInvalid ? "invalid" : ""}`}>
              {dimensions.length === 0 && <p className="placeholder">Drag fields here</p>}
              {dimensions.map((dim) => (
                <div key={dim} className="assigned-pill dimension">
                  <span>{dim}</span>
                  <button onClick={() => onRemove(dim)}>×</button>
                </div>
              ))}
            </div>
          </div>

          <div className="role-group measure-group">
            <h4>{labels.meas}</h4>
            <div className={`role-pool green-zone ${isMeasInvalid ? "invalid" : ""}`}>
              {measures.length === 0 && <p className="placeholder">Drag fields here</p>}
              {measures.map((meas) => (
                <div key={meas} className="assigned-pill measure">
                  <span>{meas}</span>
                  <button onClick={() => onRemove(meas)}>×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
