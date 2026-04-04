import React from "react";
import { MoveRight, MoveLeft, Hash, Type, Calendar, CheckCircle2 } from "lucide-react";

export default function DimensionMeasureSelector({ 
  availableColumns = [], 
  dimensions = [], 
  measures = [], 
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

  return (
    <div className="selector-container">
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
        <div className="role-group dimensions">
          <h4>Dimensions (Category)</h4>
          <div className="role-pool blue-zone">
            {dimensions.length === 0 && <p className="placeholder">Drag or click fields to add dimensions</p>}
            {dimensions.map((dim) => (
              <div key={dim} className="assigned-pill dimension">
                <span>{dim}</span>
                <button onClick={() => onRemove(dim)}>×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="role-group measures">
          <h4>Measures (Numeric)</h4>
          <div className="role-pool green-zone">
            {measures.length === 0 && <p className="placeholder">Drag or click fields to add measures</p>}
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
  );
}
