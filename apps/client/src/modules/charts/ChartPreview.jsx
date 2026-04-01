import { useRef, useEffect } from 'react';
import * as echarts from 'echarts';

function ChartPreview({ option, style, onInstance }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Init or get existing instance
    if (!instanceRef.current) {
      instanceRef.current = echarts.init(chartRef.current, null, { renderer: 'canvas' });
      if (onInstance) onInstance(instanceRef.current);
    }

    instanceRef.current.setOption(option || {}, true);

    const handleResize = () => {
      instanceRef.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    // ResizeObserver for container resize (e.g., grid layout changes)
    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        instanceRef.current?.resize();
      });
      observer.observe(chartRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [option]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  return (
    <div
      ref={chartRef}
      className="chart-preview-container"
      style={{ width: '100%', height: '400px', ...style }}
    />
  );
}

export default ChartPreview;
