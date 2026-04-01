import { useMemo, useState, useRef, useEffect } from 'react';
import { Responsive } from 'react-grid-layout';
import ChartTile from './ChartTile';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

function DashboardGrid({ charts, layout, annotations, globalFilters, onLayoutChange, onAnnotationChange, onRemoveChart }) {
  // Build layouts for react-grid-layout
  const gridLayouts = useMemo(() => {
    const lg = layout.map((item, i) => ({
      i: item.i || String(i),
      x: item.x ?? (i % 3) * 4,
      y: item.y ?? Math.floor(i / 3) * 4,
      w: item.w ?? 4,
      h: item.h ?? 4,
      minW: 2,
      minH: 2,
    }));
    return { lg, md: lg, sm: lg.map(l => ({ ...l, w: 6, x: (l.x % 2) * 6 })) };
  }, [layout]);

  const handleLayoutChange = (currentLayout) => {
    const newLayout = currentLayout.map(l => ({
      i: l.i,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
    }));
    onLayoutChange?.(newLayout);
  };

  const [width, setWidth] = useState(1200);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  if (charts.length === 0) {
    return (
      <div className="dash-grid-empty">
        <div className="dash-grid-empty-icon">📊</div>
        <h3>Empty Dashboard</h3>
        <p>Add charts from the sidebar to start building your dashboard.</p>
      </div>
    );
  }

  return (
    <div className="dash-grid-wrapper" ref={wrapperRef}>
      <Responsive
        width={width}
        className="dash-grid"
        layouts={gridLayouts}
        breakpoints={{ lg: 1200, md: 900, sm: 600 }}
        cols={{ lg: 12, md: 6, sm: 1 }}
        rowHeight={80}
        margin={[14, 14]}
        containerPadding={[0, 0]}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".dash-tile-header"
        isResizable={true}
        isDraggable={true}
        useCSSTransforms={true}
      >
        {charts.map((chart, i) => {
          const key = layout[i]?.i || String(i);
          return (
            <div key={key} className="dash-grid-item">
              <ChartTile
                chart={chart}
                annotation={annotations?.[key] || ''}
                globalFilters={globalFilters}
                onAnnotationChange={(text) => onAnnotationChange?.(key, text)}
                onRemove={() => onRemoveChart?.(i)}
              />
            </div>
          );
        })}
      </Responsive>
    </div>
  );
}

export default DashboardGrid;
