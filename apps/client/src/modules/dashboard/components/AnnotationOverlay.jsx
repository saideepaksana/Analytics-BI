import React, { useState } from "react";

export default function AnnotationOverlay({ annotations = [], onAdd, onDelete, isActive, chartWidth, chartHeight }) {
  const [addingInput, setAddingInput] = useState(null);
  const [text, setText] = useState("");

  const handleOverlayClick = (e) => {
    if (!isActive) return;
    if (e.target !== e.currentTarget) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pctX = ((e.clientX - rect.left) / rect.width) * 100;
    const pctY = ((e.clientY - rect.top) / rect.height) * 100;
    
    // As per instruction, immediately open text input at that position
    setAddingInput({ x: pctX, y: pctY });
    setText("");
  };

  const handleSave = () => {
    if (addingInput && text.trim() !== "") {
      onAdd({ ...addingInput, text: text.trim() });
    }
    setAddingInput(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setAddingInput(null);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0, left: 0, width: "100%", height: "100%",
        pointerEvents: isActive ? "all" : "none",
        cursor: isActive ? "crosshair" : "default",
        zIndex: 10
      }}
      onClick={handleOverlayClick}
    >
      {annotations.map((a, i) => (
        <div
          key={i}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(i); }}
          style={{
            position: "absolute",
            left: `${a.x}%`, top: `${a.y}%`,
            display: "flex", alignItems: "center", gap: "6px",
            transform: "translate(-5px, -5px)",
            pointerEvents: "auto",
            cursor: "pointer"
          }}
          title="Right-click to delete"
        >
          <div style={{
            width: "10px", height: "10px",
            backgroundColor: "#f59e0b",
            borderRadius: "50%",
            border: "1.5px solid #fff",
          }} />
          <span style={{ fontSize: "12px", color: "#f8fafc", backgroundColor: "rgba(15,23,42,0.8)", padding: "2px 6px", borderRadius: "4px", whiteSpace: "nowrap" }}>
            {a.text}
          </span>
        </div>
      ))}

      {addingInput && (
        <div style={{
          position: "absolute", left: `${addingInput.x}%`, top: `${addingInput.y}%`,
          transform: "translate(-50%, -50%)", zIndex: 20
        }}>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #f59e0b", outline: "none", backgroundColor: "#1e293b", color: "#fff", fontSize: "12px" }}
            placeholder="Type annotation..."
          />
        </div>
      )}
    </div>
  );
}
