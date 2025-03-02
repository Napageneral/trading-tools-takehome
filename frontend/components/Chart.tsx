"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5stock from '@amcharts/amcharts5/stock';
import { Granularity, getIntervalForGranularity } from '../types/Granularity';
import { useChartSetup } from '../hooks/useChartSetup';
import { calculateVisibleTickCount } from '../utils/chartDataTransform';
import useStats from '../hooks/useStats';

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
  width = 800
}, ref) => {
  const chartDivRef = useRef<HTMLDivElement>(null);
  const controlsDivRef = useRef<HTMLDivElement>(null);
  
  const rootRef = useRef<am5.Root | null>(null);
  const stockChartRef = useRef<am5stock.StockChart | null>(null);
  const mainPanelRef = useRef<am5stock.StockPanel | null>(null);
  
  const shouldFitOnNextLoadRef = useRef(true);
  const lastVisibleRangeRef = useRef<{ from: number; to: number } | null>(null);
  const currentGranularityRef = useRef<Granularity | null>(null);
  const intervalSwitcherRef = useRef<am5stock.IntervalControl | null>(null);
  const visibleTickCountRef = useRef<number>(0);

  const [datasetBounds, setDatasetBounds] = useState<{ start: number; end: number } | null>(null);

  const [visibleRange, setVisibleRange] = useState<{ from: number; to: number } | null>(null);
  const [loadedRange, setLoadedRange] = useState<{ from: number; to: number } | null>(null);

  const { stats } = useStats();

  useEffect(() => {
    if (stats && stats.min_timestamp_ns !== undefined && stats.max_timestamp_ns !== undefined) {
      setDatasetBounds({ start: stats.min_timestamp_ns, end: stats.max_timestamp_ns });
    }
  }, [stats]);

  useEffect(() => {
    if (currentGranularity) {
      currentGranularityRef.current = currentGranularity;
    }
  }, [currentGranularity]);

  useEffect(() => {
    if (currentGranularity && mainPanelRef.current) {
      const startChartUpdateTime = performance.now();
      const xAxis = mainPanelRef.current.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRenderer>;
      if (xAxis) {
        xAxis.set("baseInterval", getIntervalForGranularity(currentGranularity));
        const chartUpdateDuration = performance.now() - startChartUpdateTime;
        console.log(`Updated chart axis baseInterval to: ${JSON.stringify(getIntervalForGranularity(currentGranularity))}`);
        console.log(`Chart update time: ${chartUpdateDuration.toFixed(2)} ms`);
      }
    }
  }, [currentGranularity]);

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

  useEffect(() => {
    if (datasetBounds && mainPanelRef.current) {
      const xAxis = mainPanelRef.current.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRenderer>;
      if (xAxis) {
        const overallStartMs = datasetBounds.start / 1_000_000;
        const overallEndMs = datasetBounds.end / 1_000_000;
        xAxis.set('min', overallStartMs);
        xAxis.set('max', overallEndMs);
        console.log(`Fixed xAxis domain: ${overallStartMs} to ${overallEndMs} ms`);
      }
    }
  }, [datasetBounds, mainPanelRef]);

  useImperativeHandle(ref, () => ({
    fitContent: () => {
      if (mainPanelRef.current && shouldFitOnNextLoadRef.current) {
        mainPanelRef.current.zoomOut();
        shouldFitOnNextLoadRef.current = false;
        const xAxis = mainPanelRef.current.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRenderer>;
        if (xAxis && xAxis.getPrivate('selectionMin' as any) && xAxis.getPrivate('selectionMax' as any)) {
          const from = (xAxis.getPrivate('selectionMin' as any) as number) / 1000;
          const to = (xAxis.getPrivate('selectionMax' as any) as number) / 1000;
          console.log(`[Chart] fitContent: xAxis selection detected - from: ${from}, to: ${to}`);
          if (onVisibleRangeChangeWithGranularity) {
            const visibleRangeNs = Math.floor((to - from) * 1_000_000_000);
            onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
          }
        } else if (datasetBounds) {
          const from = datasetBounds.start / 1_000_000_000;
          const to = datasetBounds.end / 1_000_000_000;
          console.log(`[Chart] fitContent: Falling back to datasetBounds - from: ${from}, to: ${to}`);
          if (onVisibleRangeChangeWithGranularity) {
            const visibleRangeNs = datasetBounds.end - datasetBounds.start;
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
        if (xAxis && xAxis.getPrivate('selectionMin' as any) && xAxis.getPrivate('selectionMax' as any)) {
          const from = (xAxis.getPrivate('selectionMin' as any) as number) / 1000;
          const to = (xAxis.getPrivate('selectionMax' as any) as number) / 1000;
          console.log(`[Chart] getVisibleRange: xAxis selection - from: ${from}, to: ${to}`);
          return { from, to };
        } else if (datasetBounds) {
          const from = datasetBounds.start / 1_000_000_000;
          const to = datasetBounds.end / 1_000_000_000;
          console.log(`[Chart] getVisibleRange: falling back to datasetBounds - from: ${from}, to: ${to}`);
          return { from, to };
        }
      }
      return null;
    },
    getVisibleLogicalRange: () => {
      if (mainPanelRef.current) {
        const xAxis = mainPanelRef.current.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRenderer>;
        if (xAxis) {
          const min = xAxis.get('start') || 0;
          const max = xAxis.get('end') || 1;
          return { from: min, to: max };
        }
      }
      return null;
    },
    getVisibleTickCount: () => {
      const xAxis = mainPanelRef.current?.xAxes.getIndex(0);
      const selectionMin = xAxis?.getPrivate('selectionMin' as any);
      const selectionMax = xAxis?.getPrivate('selectionMax' as any);
      const visibleRange = (selectionMin && selectionMax) ? {
        from: (selectionMin as number) / 1000,
        to: (selectionMax as number) / 1000
      } : null;
      if (visibleRange) {
        return calculateVisibleTickCount(data, visibleRange.from, visibleRange.to);
      }
      return visibleTickCountRef.current;
    }
  }));

  useEffect(() => {
    const interval = setInterval(() => {
      if (mainPanelRef.current) {
        const xAxis = mainPanelRef.current.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRenderer>;
        if (xAxis && xAxis.getPrivate('selectionMin' as any) && xAxis.getPrivate('selectionMax' as any)) {
          const from = (xAxis.getPrivate('selectionMin' as any) as number) / 1000;
          const to = (xAxis.getPrivate('selectionMax' as any) as number) / 1000;
          setVisibleRange({ from, to });
        } else if (datasetBounds) {
          const from = datasetBounds.start / 1_000_000_000;
          const to = datasetBounds.end / 1_000_000_000;
          setVisibleRange({ from, to });
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [datasetBounds, mainPanelRef]);

  useEffect(() => {
    if (data && data.length > 0) {
      const from = data[0].time;
      const to = data[data.length - 1].time;
      setLoadedRange({ from, to });
    } else {
      setLoadedRange(null);
    }
  }, [data]);

  useEffect(() => {
    if (loadedRange && datasetBounds) {
      const overallDurationSec = (datasetBounds.end - datasetBounds.start) / 1e9;
      const loadedDurationSec = loadedRange.to - loadedRange.from;
      if (loadedDurationSec < overallDurationSec) {
        const xAxis = mainPanelRef.current?.xAxes.getIndex(0);
        if (xAxis) {
          const dateAxis = xAxis as am5xy.DateAxis<am5xy.AxisRenderer>;
          const newMin = loadedRange.from * 1000;
          const newMax = loadedRange.to * 1000;
          dateAxis.zoomToDates(new Date(newMin), new Date(newMax));
          console.log(`Zoomed to loaded range: ${newMin} ms to ${newMax} ms`);
        }
      }
    }
  }, [loadedRange, datasetBounds]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={controlsDivRef} className="chart-controls" />
      <div 
        ref={chartDivRef} 
        style={{ 
          width: '100%', 
          height: `${height}px` 
        }}
      />
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        transform: 'translateY(-40px)',
        background: 'rgba(255,255,255,0.8)',
        padding: '10px',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: 10
      }}>
        <div><strong>Overall Range:</strong> {datasetBounds ? new Date(datasetBounds.start / 1_000_000).toLocaleString() + ' - ' + new Date(datasetBounds.end / 1_000_000).toLocaleString() : 'N/A'}</div>
        <div><strong>Loaded Range:</strong> {loadedRange ? new Date(loadedRange.from * 1000).toLocaleString() + ' - ' + new Date(loadedRange.to * 1000).toLocaleString() : 'N/A'}</div>
        <div><strong>Visible Range:</strong> {visibleRange ? new Date(visibleRange.from * 1000).toLocaleString() + ' - ' + new Date(visibleRange.to * 1000).toLocaleString() : 'N/A'}</div>
      </div>
    </div>
  );
});

export default Chart;