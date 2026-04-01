import { COLOR_PALETTES } from './chartBuilder';

const LEGEND_POSITIONS = ['top', 'bottom', 'left', 'right'];

function ChartCustomizer({ customization, onChange }) {
  const {
    title = '',
    palette = 'vibrant',
    showLegend = true,
    legendPosition = 'top',
    showAxisLabels = true,
    showGridLines = true,
  } = customization;

  const update = (key, value) => {
    onChange({ ...customization, [key]: value });
  };

  return (
    <div className="chart-customizer">
      {/* Title */}
      <div className="cust-section">
        <label className="cust-label">Chart Title</label>
        <input
          type="text"
          className="cust-input"
          placeholder="Enter a descriptive chart title…"
          value={title}
          onChange={e => update('title', e.target.value)}
        />
      </div>

      {/* Color Palette */}
      <div className="cust-section">
        <label className="cust-label">Color Palette</label>
        <div className="cust-palette-grid">
          {Object.entries(COLOR_PALETTES).map(([name, colors]) => (
            <button
              key={name}
              type="button"
              className={`cust-palette-card ${palette === name ? 'active' : ''}`}
              onClick={() => update('palette', name)}
            >
              <div className="cust-palette-preview">
                {colors.slice(0, 5).map((c, i) => (
                  <span key={i} className="cust-swatch" style={{ background: c }} />
                ))}
              </div>
              <span className="cust-palette-name">{name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="cust-section">
        <label className="cust-label">Legend</label>
        <div className="cust-row">
          <label className="cust-toggle-label">
            <input
              type="checkbox"
              checked={showLegend}
              onChange={e => update('showLegend', e.target.checked)}
            />
            <span>Show Legend</span>
          </label>
          {showLegend && (
            <div className="cust-select-wrap">
              <select
                className="cust-select"
                value={legendPosition}
                onChange={e => update('legendPosition', e.target.value)}
              >
                {LEGEND_POSITIONS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Axis Labels */}
      <div className="cust-section">
        <label className="cust-label">Display Options</label>
        <div className="cust-toggles">
          <label className="cust-toggle-label">
            <input
              type="checkbox"
              checked={showAxisLabels}
              onChange={e => update('showAxisLabels', e.target.checked)}
            />
            <span>Axis Labels</span>
          </label>
          <label className="cust-toggle-label">
            <input
              type="checkbox"
              checked={showGridLines}
              onChange={e => update('showGridLines', e.target.checked)}
            />
            <span>Grid Lines</span>
          </label>
        </div>
      </div>
    </div>
  );
}

export default ChartCustomizer;
