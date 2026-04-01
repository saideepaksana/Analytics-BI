import { useState, useRef, useEffect, useMemo } from 'react';
import { MessageSquare, X, MoreVertical, Trash2 } from 'lucide-react';
import ChartPreview from '../charts/ChartPreview';
import { buildChartOption, applyGlobalFilters } from '../charts/chartBuilder';

function ChartTile({ chart, annotation, globalFilters, onAnnotationChange, onRemove }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [annotationText, setAnnotationText] = useState(annotation || '');
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Apply global filters
  const filteredData = useMemo(() => {
    if (!chart.data) return [];
    return applyGlobalFilters(chart.data, globalFilters || {}, chart.columns || []);
  }, [chart.data, globalFilters, chart.columns]);

  const option = useMemo(() => buildChartOption({
    chartType: chart.chartType,
    dimensions: chart.dimensions,
    measures: chart.measures,
    data: filteredData,
    customization: chart.customization || {},
  }), [chart, filteredData]);

  const handleSaveAnnotation = () => {
    onAnnotationChange?.(annotationText);
    setShowAnnotation(false);
  };

  return (
    <div className="dash-tile">
      {/* Tile header */}
      <div className="dash-tile-header" onMouseDown={e => e.stopPropagation()}>
        <span className="dash-tile-name">{chart.name || 'Untitled'}</span>
        <div className="dash-tile-actions" ref={menuRef}>
          <button
            type="button"
            className="dash-tile-menu-btn"
            onClick={() => setShowMenu(!showMenu)}
          >
            <MoreVertical size={14} />
          </button>
          {showMenu && (
            <div className="dash-tile-menu">
              <button type="button" onClick={() => { setShowAnnotation(true); setShowMenu(false); }}>
                <MessageSquare size={13} /> {annotation ? 'Edit Annotation' : 'Add Annotation'}
              </button>
              <button type="button" className="dash-tile-menu-danger" onClick={() => { onRemove?.(); setShowMenu(false); }}>
                <Trash2 size={13} /> Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="dash-tile-chart">
        <ChartPreview option={option} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Annotation badge */}
      {annotation && !showAnnotation && (
        <div className="dash-tile-annotation-badge" onClick={() => setShowAnnotation(true)}>
          <MessageSquare size={11} />
          <span>{annotation.length > 40 ? annotation.slice(0, 40) + '…' : annotation}</span>
        </div>
      )}

      {/* Annotation editor overlay */}
      {showAnnotation && (
        <div className="dash-tile-annotation-overlay" onMouseDown={e => e.stopPropagation()}>
          <div className="dash-tile-annotation-editor">
            <div className="dash-annot-head">
              <h4><MessageSquare size={14} /> Annotation</h4>
              <button type="button" onClick={() => setShowAnnotation(false)}><X size={14} /></button>
            </div>
            <textarea
              className="dash-annot-textarea"
              placeholder="Add a note to explain this visualization…"
              value={annotationText}
              onChange={e => setAnnotationText(e.target.value)}
              rows={3}
            />
            <div className="dash-annot-actions">
              <button type="button" className="ghost-btn" onClick={() => { setAnnotationText(''); onAnnotationChange?.(''); setShowAnnotation(false); }}>
                Clear
              </button>
              <button type="button" className="primary-btn" onClick={handleSaveAnnotation}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChartTile;
