import { useState, useMemo } from 'react';
import { Filter, X, Calendar, Tag, RotateCcw } from 'lucide-react';

function GlobalFilterBar({ filters, onChange, columns }) {
  const [expanded, setExpanded] = useState(false);

  // Detect potential date and category columns
  const dateColumns = useMemo(() =>
    columns.filter(c => /date|time|created|updated|timestamp/i.test(c)),
    [columns]
  );
  const catColumns = useMemo(() =>
    columns.filter(c => !/date|time|created|updated|timestamp/i.test(c)),
    [columns]
  );

  const hasActiveFilters = filters.startDate || filters.endDate || filters.categoryValue;

  const update = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const clearAll = () => {
    onChange({ dateColumn: '', startDate: '', endDate: '', categoryColumn: '', categoryValue: '' });
  };

  return (
    <div className={`gf-bar ${expanded ? 'gf-expanded' : ''}`}>
      <button type="button" className="gf-toggle" onClick={() => setExpanded(!expanded)}>
        <Filter size={14} />
        <span>Global Filters</span>
        {hasActiveFilters && <span className="gf-active-dot" />}
      </button>

      {expanded && (
        <div className="gf-content">
          {/* Date filter */}
          <div className="gf-group">
            <label className="gf-label"><Calendar size={12} /> Date Range</label>
            <div className="gf-row">
              <select
                className="gf-select"
                value={filters.dateColumn || ''}
                onChange={e => update('dateColumn', e.target.value)}
              >
                <option value="">Select column…</option>
                {dateColumns.map(c => <option key={c} value={c}>{c}</option>)}
                {dateColumns.length === 0 && catColumns.slice(0, 5).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="date"
                className="gf-date"
                value={filters.startDate || ''}
                onChange={e => update('startDate', e.target.value)}
              />
              <span className="gf-sep">to</span>
              <input
                type="date"
                className="gf-date"
                value={filters.endDate || ''}
                onChange={e => update('endDate', e.target.value)}
              />
            </div>
          </div>

          {/* Category filter */}
          <div className="gf-group">
            <label className="gf-label"><Tag size={12} /> Category Filter</label>
            <div className="gf-row">
              <select
                className="gf-select"
                value={filters.categoryColumn || ''}
                onChange={e => update('categoryColumn', e.target.value)}
              >
                <option value="">Select column…</option>
                {catColumns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                className="gf-text"
                placeholder="Filter value…"
                value={filters.categoryValue || ''}
                onChange={e => update('categoryValue', e.target.value)}
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button type="button" className="gf-clear" onClick={clearAll}>
              <RotateCcw size={12} /> Clear All Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default GlobalFilterBar;
