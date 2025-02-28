import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { createChart, IChartApi, ISeriesApi, LineData, LogicalRange, UTCTimestamp, Time, Range } from 'lightweight-charts';

interface TimeSeriesChartProps {
  data: LineData[];
  onRangeChange?: (range: { from: number; to: number }) => void;
  onVisibleRangeChangeWithGranularity?: (range: { from: number; to: number; visibleRangeNs: number }) => void;
  height?: number;
  width?: number;
}

export interface TimeSeriesChartHandle {
  fitContent: () => void;
  resetFitContent: () => void;
  getVisibleRange: () => { from: number; to: number } | null;
  getVisibleLogicalRange: () => { from: number; to: number } | null;
}

// Update the VisibleRange type definition to match the library's Range<Time> type
type VisibleRange = Range<Time> | null;

const TimeSeriesChart = forwardRef<TimeSeriesChartHandle, TimeSeriesChartProps>(({
  data,
  onRangeChange,
  onVisibleRangeChangeWithGranularity,
  height = 400,
  width = 800,
}, ref) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const lastVisibleRangeRef = useRef<{ from: number; to: number } | null>(null);
  const shouldFitOnNextLoadRef = useRef(true);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    fitContent: () => {
      if (chartRef.current && shouldFitOnNextLoadRef.current) {
        chartRef.current.timeScale().fitContent();
        shouldFitOnNextLoadRef.current = false;

        const visibleRange = chartRef.current.timeScale().getVisibleRange();
        if (visibleRange && onVisibleRangeChangeWithGranularity) {
          const from = Number(visibleRange.from);
          const to = Number(visibleRange.to);
          const visibleRangeNs = Math.floor((to - from) * 1_000_000_000);
          onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
        }
      }
    },
    resetFitContent: () => {
      shouldFitOnNextLoadRef.current = true;
    },
    getVisibleRange: () => {
      if (chartRef.current) {
        const visibleRange = chartRef.current.timeScale().getVisibleRange();
        if (visibleRange) {
          return {
            from: Number(visibleRange.from),
            to: Number(visibleRange.to)
          };
        }
      }
      return null;
    },
    getVisibleLogicalRange: () => {
      if (chartRef.current) {
        const logicalRange = chartRef.current.timeScale().getVisibleLogicalRange();
        if (logicalRange) {
          return {
            from: logicalRange.from,
            to: logicalRange.to
          };
        }
      }
      return null;
    }
  }));

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
          background: { color: 'transparent' },
          textColor: '#333',
          fontFamily: 'system-ui, -apple-system, sans-serif',
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
          tickMarkFormatter: (time: UTCTimestamp) => {
            // Convert UTC timestamp to local date string
            const date = new Date(time * 1000);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          },
        },
        rightPriceScale: {
          borderColor: 'rgba(197, 203, 206, 0.8)',
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        crosshair: {
          mode: 1,
          vertLine: {
            labelBackgroundColor: '#0ea5e9',
          },
          horzLine: {
            labelBackgroundColor: '#0ea5e9',
          },
        },
        localization: {
          timeFormatter: (time: UTCTimestamp) => {
            const date = new Date(time * 1000);
            return date.toLocaleString();
          },
        },
      });

      // Add line series
      const lineSeries = chart.addLineSeries({
        color: '#0ea5e9',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: false,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => price.toFixed(2),
        },
      });

      // Set data
      if (data.length > 0) {
        lineSeries.setData(data);
        
        // Fit content to view all data
        chart.timeScale().fitContent();
      }

      // Handle time range changes
      if (onRangeChange) {
        chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
          console.log('subscribeVisibleTimeRangeChange event (onRangeChange):', range);
          if (range) {
            const from = Number(range.from);
            const to = Number(range.to);
            onRangeChange({ from, to });
          }
        });
      }

      // Handle time range changes with granularity
      if (onVisibleRangeChangeWithGranularity) {
        chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
          console.log('subscribeVisibleTimeRangeChange event (onVisibleRangeChangeWithGranularity):', range);
          if (range) {
            const from = Number(range.from);
            const to = Number(range.to);
            
            // Only trigger if the range has changed significantly
            if (!lastVisibleRangeRef.current || 
                Math.abs(from - (lastVisibleRangeRef.current.from || 0)) > 0.01 ||
                Math.abs(to - (lastVisibleRangeRef.current.to || 0)) > 0.01) {
              
              const visibleRangeNs = Math.floor((to - from) * 1_000_000_000);
              console.log('Triggering onVisibleRangeChangeWithGranularity with:', { from, to, visibleRangeNs });
              onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
              
              // Update last visible range
              lastVisibleRangeRef.current = { from, to };
            }
          }
        });
        
        // Also subscribe to logical range change (zoom events)
        chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange: LogicalRange | null) => {
          console.log('subscribeVisibleLogicalRangeChange event:', logicalRange);
          if (logicalRange) {
            // After zoom, get the actual time range
            const visibleRange = chart.timeScale().getVisibleRange();
            console.log('Computed visible range from logical change:', visibleRange);
            if (visibleRange) {
              const from = Number(visibleRange.from);
              const to = Number(visibleRange.to);
              
              // Only trigger if the range has changed significantly
              if (!lastVisibleRangeRef.current || 
                  Math.abs(from - (lastVisibleRangeRef.current.from || 0)) > 0.01 ||
                  Math.abs(to - (lastVisibleRangeRef.current.to || 0)) > 0.01) {
                
                const visibleRangeNs = Math.floor((to - from) * 1_000_000_000);
                console.log('Triggering onVisibleRangeChangeWithGranularity from logical change with:', { from, to, visibleRangeNs });
                onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
                
                // Update last visible range
                lastVisibleRangeRef.current = { from, to };
              }
            }
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
  }, [height, onRangeChange, onVisibleRangeChangeWithGranularity]);

  // Update data when it changes
  useEffect(() => {
    if (seriesRef.current && data.length > 0) {
      seriesRef.current.setData(data);
      
      // Fit content to view all data when it changes
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
        
        // After fitting content, trigger a visible range change event to update granularity
        const visibleRange = chartRef.current.timeScale().getVisibleRange();
        if (visibleRange && onVisibleRangeChangeWithGranularity) {
          const from = Number(visibleRange.from);
          const to = Number(visibleRange.to);
          const visibleRangeNs = Math.floor((to - from) * 1_000_000_000);
          onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
        }
      }
    }
  }, [data, onVisibleRangeChangeWithGranularity]);

  return <div ref={chartContainerRef} className="w-full" />;
});

export default TimeSeriesChart; 