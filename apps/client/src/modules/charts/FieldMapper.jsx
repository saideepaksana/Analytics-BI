import { useState } from 'react';
import { GripVertical, Hash, Type, Calendar, ArrowRight, X } from 'lucide-react';

/**
 * Classifies column types based on sample data values
 */
function detectColumnType(columnName, sampleValues) {
  const nonNull = sampleValues.filter(v => v != null && v !== '');
  if (nonNull.length === 0) return 'text';
  
  const numCount = nonNull.filter(v => !isNaN(parseFloat(v))).length;
  if (numCount / nonNull.length > 0.7) return 'number';
  
  const dateCount = nonNull.filter(v => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && String(v).length > 4;
  }).length;
  if (dateCount / nonNull.length > 0.5) return 'date';
  
  return 'text';
}

const TYPE_ICONS = {
  number: Hash,
  text: Type,
  date: Calendar,
};

function FieldMapper({ columns, data, dimensions, measures, onDimensionsChange, onMeasuresChange }) {
  const [dragItem, setDragItem] = useState(null);

  // Detect column types from data
  const columnMeta = columns.map(col => {
    const samples = data.slice(0, 20).map(row => row[col]);
    return { name: col, type: detectColumnType(col, samples) };
  });

  // Available columns (not yet assigned)
  const assigned = new Set([...dimensions, ...measures]);
  const available = columnMeta.filter(c => !assigned.has(c.name));

  const handleDragStart = (colName) => {
    setDragItem(colName);
  };

  const handleDropDimension = () => {
    if (dragItem && !dimensions.includes(dragItem)) {
      // Remove from measures if there
      onMeasuresChange(measures.filter(m => m !== dragItem));
      onDimensionsChange([...dimensions, dragItem]);
    }
    setDragItem(null);
  };

  const handleDropMeasure = () => {
    if (dragItem && !measures.includes(dragItem)) {
      // Remove from dimensions if there
      onDimensionsChange(dimensions.filter(d => d !== dragItem));
      onMeasuresChange([...measures, dragItem]);
    }
    setDragItem(null);
  };

  const removeDimension = (col) => {
    onDimensionsChange(dimensions.filter(d => d !== col));
  };

  const removeMeasure = (col) => {
    onMeasuresChange(measures.filter(m => m !== col));
  };

  const addToDimensions = (col) => {
    onMeasuresChange(measures.filter(m => m !== col));
    if (!dimensions.includes(col)) onDimensionsChange([...dimensions, col]);
  };

  const addToMeasures = (col) => {
    onDimensionsChange(dimensions.filter(d => d !== col));
    if (!measures.includes(col)) onMeasuresChange([...measures, col]);
  };

  const getMeta = (colName) => columnMeta.find(c => c.name === colName) || { name: colName, type: 'text' };

  return (
    <div className="field-mapper">
      {/* Available Columns */}
      <div className="fm-panel fm-available">
        <div className="fm-panel-header">
          <h4>Available Columns</h4>
          <span className="fm-count">{available.length}</span>
        </div>
        <div className="fm-list">
          {available.map(col => {
            const TypeIcon = TYPE_ICONS[col.type] || Type;
            return (
              <div
                key={col.name}
                className="fm-chip"
                draggable
                onDragStart={() => handleDragStart(col.name)}
              >
                <GripVertical size={12} className="fm-grip" />
                <TypeIcon size={13} className={`fm-type-icon fm-type-${col.type}`} />
                <span className="fm-chip-label">{col.name}</span>
                <div className="fm-chip-actions">
                  <button type="button" className="fm-add-btn" title="Add as Dimension" onClick={() => addToDimensions(col.name)}>
                    D
                  </button>
                  <button type="button" className="fm-add-btn fm-add-measure" title="Add as Measure" onClick={() => addToMeasures(col.name)}>
                    M
                  </button>
                </div>
              </div>
            );
          })}
          {available.length === 0 && <div className="fm-empty">All columns assigned</div>}
        </div>
      </div>

      <div className="fm-arrow">
        <ArrowRight size={20} />
      </div>

      {/* Drop Zones */}
      <div className="fm-targets">
        {/* Dimensions */}
        <div
          className={`fm-panel fm-drop-zone ${dragItem ? 'fm-drop-active' : ''}`}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDropDimension}
        >
          <div className="fm-panel-header">
            <h4>📐 Dimensions <span className="fm-hint">(Categories)</span></h4>
            <span className="fm-count">{dimensions.length}</span>
          </div>
          <div className="fm-list">
            {dimensions.map(col => {
              const meta = getMeta(col);
              const TypeIcon = TYPE_ICONS[meta.type] || Type;
              return (
                <div key={col} className="fm-chip fm-chip-assigned">
                  <TypeIcon size={13} className={`fm-type-icon fm-type-${meta.type}`} />
                  <span className="fm-chip-label">{col}</span>
                  <button type="button" className="fm-remove-btn" onClick={() => removeDimension(col)}>
                    <X size={12} />
                  </button>
                </div>
              );
            })}
            {dimensions.length === 0 && (
              <div className="fm-empty-zone">Drag or click columns here</div>
            )}
          </div>
        </div>

        {/* Measures */}
        <div
          className={`fm-panel fm-drop-zone ${dragItem ? 'fm-drop-active' : ''}`}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDropMeasure}
        >
          <div className="fm-panel-header">
            <h4>📊 Measures <span className="fm-hint">(Numbers)</span></h4>
            <span className="fm-count">{measures.length}</span>
          </div>
          <div className="fm-list">
            {measures.map(col => {
              const meta = getMeta(col);
              const TypeIcon = TYPE_ICONS[meta.type] || Type;
              return (
                <div key={col} className="fm-chip fm-chip-assigned">
                  <TypeIcon size={13} className={`fm-type-icon fm-type-${meta.type}`} />
                  <span className="fm-chip-label">{col}</span>
                  <button type="button" className="fm-remove-btn" onClick={() => removeMeasure(col)}>
                    <X size={12} />
                  </button>
                </div>
              );
            })}
            {measures.length === 0 && (
              <div className="fm-empty-zone">Drag or click columns here</div>
            )}
          </div>
        </div>
      </div>

      {/* Validation message */}
      {(dimensions.length === 0 || measures.length === 0) && (
        <div className="fm-validation">
          ⚠️ Select at least <strong>1 Dimension</strong> and <strong>1 Measure</strong> to proceed
        </div>
      )}
    </div>
  );
}

export default FieldMapper;
