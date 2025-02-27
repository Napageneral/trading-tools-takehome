import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, LineData, TimeRange, LogicalRange } from 'lightweight-charts';

interface TimeSeriesChartProps {
  data: LineData[];
  onRangeChange?: (range: { from: number; to: number }) => void;
  height?: number;
  width?: number;
}

const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  onRangeChange,
  height = 400,
  width = 800,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Initialize chart
  useEffect(() => {
    if (chartContainerRef.current) {
      // Clean up previous chart if it exists
      if (chartRef.current) {
        chartRef.current.remove();
      }

      // Create new chart
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: height,
        layout: {
          background: { type: 'solid', color: 'transparent' },
          textColor: getComputedStyle(document.documentElement).getPropertyValue('--foreground-rgb').trim(),
        },
        grid: {
          vertLines: {
            color: 'rgba(197, 203, 206, 0.2)',
          },
          horzLines: {
            color: 'rgba(197, 203, 206, 0.2)',
          },
        },
        timeScale: {
          borderColor: 'rgba(197, 203, 206, 0.8)',
          timeVisible: true,
          secondsVisible: true,
        },
        rightPriceScale: {
          borderColor: 'rgba(197, 203, 206, 0.8)',
        },
        crosshair: {
          mode: 1,
        },
      });

      // Add line series
      const lineSeries = chart.addLineSeries({
        color: '#0ea5e9',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: false,
      });

      // Set data
      if (data.length > 0) {
        lineSeries.setData(data);
      }

      // Handle time range changes
      if (onRangeChange) {
        chart.timeScale().subscribeVisibleTimeRangeChange((range: TimeRange | null) => {
          if (range) {
            const from = range.from as number;
            const to = range.to as number;
            onRangeChange({ from, to });
          }
        });
      }

      // Store references
      chartRef.current = chart;
      seriesRef.current = lineSeries;

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
          seriesRef.current = null;
        }
      };
    }
  }, [height, onRangeChange]);

  // Update data when it changes
  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      seriesRef.current.setData(data);
    }
  }, [data]);

  return <div ref={chartContainerRef} className="w-full" />;
};

export default TimeSeriesChart; 