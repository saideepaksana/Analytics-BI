import React from "react";
import { ArrowLeft, Save, Loader2 } from "lucide-react";

/**
 * ExploreTopBar — Top bar with chart name, status badges, and save button.
 */
export default function ExploreTopBar({
  chartName,
  onChartNameChange,
  isEditing = false,
  isDirty = false,
  isSaving = false,
  onSave,
  onBack,
  lastSaved,
  extraActions = null,
}) {
  const formatTimeAgo = (date) => {
    if (!date) return "";
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} minute${mins > 1 ? "s" : ""} ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  };

  return (
    <div className="explore-top-bar">
      <div className="explore-top-left">
        <button className="explore-back-btn" onClick={onBack}>
          <ArrowLeft size={14} />
          Charts
        </button>

        <input
          className="explore-chart-name"
          value={chartName}
          onChange={(e) => onChartNameChange(e.target.value)}
          placeholder="Untitled Chart"
          spellCheck={false}
        />

        <div className="explore-badges">
          {isDirty && <span className="explore-badge altered">Altered</span>}
          {isEditing && !isDirty && (
            <span className="explore-badge saved">Saved</span>
          )}
          {lastSaved && (
            <span
              style={{
                fontSize: "0.72rem",
                color: "var(--text-secondary, #94a3b8)",
              }}
            >
              {formatTimeAgo(lastSaved)}
            </span>
          )}
        </div>
      </div>

      <div className="explore-top-right">
        {extraActions}
        <button
          className="explore-save-btn"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 size={15} className="explore-spinner" />
              Saving…
            </>
          ) : (
            <>
              <Save size={15} />
              Save
            </>
          )}
        </button>
      </div>
    </div>
  );
}
