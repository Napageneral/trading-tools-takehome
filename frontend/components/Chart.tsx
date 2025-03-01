import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5stock from '@amcharts/amcharts5/stock';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';
import { GRANULARITIES, Granularity, getIntervalForGranularity } from '../types/Granularity';
import { useChartSetup } from '../hooks/useChartSetup';
import { calculateVisibleTickCount } from '../utils/chartDataTransform';

// Define the props interface
interface ChartProps {
  data: any[];
  onVisibleRangeChangeWithGranularity?: (range: { from: number; to: number; visibleRangeNs: number }) => void;
  onGranularityChange?: (granularity: Granularity) => void;
  onMoveUpGran?: () => void;
  onMoveDownGran?: () => void;
  onPanLeft?: (amountNs: number) => void;
  onPanRight?: (amountNs: number) => void;
  currentGranularity?: Granularity;
  height?: number;
  width?: number;
}

// Define the handle interface for ref
export interface ChartHandle {
  fitContent: () => void;
  resetFitContent: () => void;
  getVisibleRange: () => { from: number; to: number } | null;
  getVisibleLogicalRange: () => { from: number; to: number } | null;
  getVisibleTickCount: () => number;
}

const Chart = forwardRef<ChartHandle, ChartProps>(({
  data,
  onVisibleRangeChangeWithGranularity,
  onGranularityChange,
  onMoveUpGran,
  onMoveDownGran,
  onPanLeft,
  onPanRight,
  currentGranularity,
  height = 500,
  width = 800,
}, ref) => {
  // Chart DOM refs
  const chartDivRef = useRef<HTMLDivElement>(null);
  const controlsDivRef = useRef<HTMLDivElement>(null);
  
  // Chart object refs
  const rootRef = useRef<am5.Root | null>(null);
  const stockChartRef = useRef<am5stock.StockChart | null>(null);
  const mainPanelRef = useRef<am5stock.StockPanel | null>(null);
  
  // Chart state refs
  const shouldFitOnNextLoadRef = useRef(true);
  const lastVisibleRangeRef = useRef<{ from: number; to: number } | null>(null);
  const currentGranularityRef = useRef<Granularity | null>(null);
  const intervalSwitcherRef = useRef<am5stock.IntervalControl | null>(null);
  const visibleTickCountRef = useRef<number>(0);

  // Update current granularity ref when prop changes
  useEffect(() => {
    if (currentGranularity) {
      currentGranularityRef.current = currentGranularity;
    }
  }, [currentGranularity]);

  // Use our custom hook to set up the chart
  useChartSetup(
    {
      chartDiv: chartDivRef.current,
      controlsDiv: controlsDivRef.current,
      data,
      onVisibleRangeChangeWithGranularity,
      onGranularityChange,
      currentGranularity,
      shouldFitOnNextLoadRef,
      lastVisibleRangeRef,
      currentGranularityRef,
      intervalSwitcherRef,
      visibleTickCountRef
    },
    {
      rootRef,
      stockChartRef,
      mainPanelRef
    }
  );

  // Listen for fit-chart-content event
  useEffect(() => {
    const handleFitContent = () => {
      if (mainPanelRef.current) {
        console.log('Fitting chart content');
        mainPanelRef.current.zoomOut();
      }
    };

    document.addEventListener('fit-chart-content', handleFitContent);
    
    return () => {
      document.removeEventListener('fit-chart-content', handleFitContent);
    };
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    fitContent: () => {
      if (mainPanelRef.current && shouldFitOnNextLoadRef.current) {
        mainPanelRef.current.zoomOut();
        shouldFitOnNextLoadRef.current = false;

        // Get visible range after zooming
        const xAxis = mainPanelRef.current.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRenderer>;
        if (xAxis && xAxis.getPrivate("selectionMin") && xAxis.getPrivate("selectionMax")) {
          const from = xAxis.getPrivate("selectionMin") as number / 1000;
          const to = xAxis.getPrivate("selectionMax") as number / 1000;
          
          if (onVisibleRangeChangeWithGranularity) {
            const visibleRangeNs = Math.floor((to - from) * 1_000_000_000);
            onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
          }
        }
      }
    },
    resetFitContent: () => {
      shouldFitOnNextLoadRef.current = true;
    },
    getVisibleRange: () => {
      if (mainPanelRef.current) {
        const xAxis = mainPanelRef.current.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRenderer>;
        if (xAxis && xAxis.getPrivate("selectionMin") && xAxis.getPrivate("selectionMax")) {
          return {
            from: xAxis.getPrivate("selectionMin") as number / 1000,
            to: xAxis.getPrivate("selectionMax") as number / 1000
          };
        }
      }
      return null;
    },
    getVisibleLogicalRange: () => {
      if (mainPanelRef.current) {
        const xAxis = mainPanelRef.current.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRenderer>;
        if (xAxis) {
          const min = xAxis.get("start") || 0;
          const max = xAxis.get("end") || 1;
          
          return {
            from: min,
            to: max
          };
        }
      }
      return null;
    },
    getVisibleTickCount: () => {
      // Get the current visible range, casting key names to any to satisfy type issues
      const xAxis = mainPanelRef.current?.xAxes.getIndex(0);
      const selectionMin = xAxis?.getPrivate("selectionMin" as any);
      const selectionMax = xAxis?.getPrivate("selectionMax" as any);
      const visibleRange = (selectionMin && selectionMax) ? {
        from: (selectionMin as number) / 1000,
        to: (selectionMax as number) / 1000
      } : null;

      // If we have a visible range, calculate and return the tick count
      if (visibleRange) {
        return calculateVisibleTickCount(data, visibleRange.from, visibleRange.to);
      }
      
      // Otherwise return the current stored value
      return visibleTickCountRef.current;
    }
  }));

  return (
    <div>
      <div ref={controlsDivRef} className="chart-controls" />
      <div 
        ref={chartDivRef} 
        style={{ 
          width: '100%', 
          height: `${height}px` 
        }}
      />
    </div>
  );
});

export default Chart; 