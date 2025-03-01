/**
 * Helper functions for configuring amCharts components
 */
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5stock from '@amcharts/amcharts5/stock';
import { GRANULARITIES, Granularity, getIntervalForGranularity } from '../types/Granularity';
import { DEFAULT_GRANULARITY } from './chartDefaults';
import { hasOHLCFormat, calculateVisibleTickCount } from './chartDataTransform';

/**
 * Configure the interval switcher for the chart
 */
export const configureIntervalSwitcher = (
  root: am5.Root,
  stockChart: am5stock.StockChart,
  dateAxis: am5xy.DateAxis<am5xy.AxisRenderer>,
  sbDateAxis: am5xy.DateAxis<am5xy.AxisRenderer>,
  currentGranularity: Granularity | undefined,
  mainPanel: am5stock.StockPanel,
  valueSeries: any,
  onGranularityChange?: (granularity: Granularity) => void,
  onVisibleRangeChangeWithGranularity?: (range: { from: number; to: number; visibleRangeNs: number }) => void,
) => {
  // Create interval switcher items from our granularity chain
  const intervalItems = Object.values(GRANULARITIES).map((gran) => {
    const interval = getIntervalForGranularity(gran);
    return {
      id: gran.symbol,
      label: gran.name,
      interval,
      granularity: gran
    };
  });

  // Create interval switcher
  const intervalSwitcher = am5stock.IntervalControl.new(root, {
    stockChart: stockChart,
    items: intervalItems
  });

  // Set initial interval if we have a current granularity
  if (currentGranularity) {
    // Find the matching interval item
    const matchingItem = intervalItems.find(item => {
      if (typeof item === 'string') {
        return false; // Skip string items
      }
      return item.id === currentGranularity.symbol;
    });
    if (matchingItem && typeof matchingItem !== 'string') {
      // Set the interval
      dateAxis.set("baseInterval", matchingItem.interval);
      sbDateAxis.set("baseInterval", matchingItem.interval);
    }
  }

  intervalSwitcher.events.on("selected", function(ev) {
    // Ensure ev.item is an object with the required properties
    const item = typeof ev.item === 'object' ? ev.item as any : { 
      interval: getIntervalForGranularity(currentGranularity || DEFAULT_GRANULARITY), 
      granularity: currentGranularity || DEFAULT_GRANULARITY, 
      id: (currentGranularity || DEFAULT_GRANULARITY).symbol 
    };

    const selectedGran = item.granularity;
    
    // Set up zoomout
    if (valueSeries) {
      valueSeries.events.once("datavalidated", function() {
        mainPanel.zoomOut();
      });
    }

    // Set baseInterval on the axes with casting to bypass type issues
    dateAxis.set("baseInterval", item.interval as any);
    sbDateAxis.set("baseInterval", item.interval as any);
    
    stockChart.indicators.each(function(indicator){
      if (indicator instanceof am5stock.ChartIndicator) {
        indicator.xAxis.set("baseInterval", item.interval as any);
      }
    });
    
    // Notify parent component of granularity change
    if (onGranularityChange) {
      onGranularityChange(selectedGran);
    }
    
    // Notify parent component of range change if needed
    if (onVisibleRangeChangeWithGranularity && dateAxis.getPrivate("selectionMin" as any) && dateAxis.getPrivate("selectionMax" as any)) {
      const from = (dateAxis.getPrivate("selectionMin" as any) as number) / 1000;
      const to = (dateAxis.getPrivate("selectionMax" as any) as number) / 1000;
      const visibleRangeNs = Math.floor((to - from) * 1_000_000_000);
      
      // Calculate and update visible tick count
      if (valueSeries && valueSeries.data && valueSeries.data.values) {
        const count = calculateVisibleTickCount(valueSeries.data.values, from, to);
        
        // Directly update the UI component
        try {
          // @ts-ignore
          if (typeof window !== 'undefined' && window.updateTickCount) {
            // @ts-ignore
            window.updateTickCount(count);
          }
        } catch (e) {
          console.error('Error updating tick count:', e);
        }
        
        console.log(`Updated visible tick count after granularity change: ${count}`);
      }
      
      onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
    }
  });

  return intervalSwitcher;
};

/**
 * Configure the series type switcher for the chart
 */
export const configureSeriesSwitcher = (
  root: am5.Root,
  stockChart: am5stock.StockChart,
  mainPanel: am5stock.StockPanel,
  valueLegend: am5stock.StockLegend
) => {
  // Function to get settings from current series
  function getNewSettings(series: any) {
    const newSettings: any = [];
    am5.array.each([
      "name", "valueYField", "highValueYField", "lowValueYField", 
      "openValueYField", "calculateAggregates", "valueXField", 
      "xAxis", "yAxis", "legendValueText", "legendRangeValueText", 
      "stroke", "fill"
    ], function(setting) {
      newSettings[setting] = series.get(setting);
    });
    return newSettings;
  }

  // Function to change series type
  function setSeriesType(seriesType: string) {
    // Get current series and its settings
    const currentSeries = stockChart.get("stockSeries");
    if (!currentSeries) return;
    
    const newSettings = getNewSettings(currentSeries);

    // Remove previous series
    const data = currentSeries.data.values;
    mainPanel.series.removeValue(currentSeries);

    // Create new series
    let series;
    switch (seriesType) {
      case "line":
        // Update line series settings to handle data gaps properly
        series = mainPanel.series.push(am5xy.LineSeries.new(root, {
          ...newSettings, 
          connect: false,
          autoGapCount: 1.1,
          minDistance: 0,
          // Handle nulls properly
          ignoreNulls: true
        }));
        break;
      case "candlestick":
      case "procandlestick":
        newSettings.clustered = false;
        series = mainPanel.series.push(am5xy.CandlestickSeries.new(root, newSettings));
        if (seriesType == "procandlestick") {
          series.columns.template.get("themeTags")?.push("pro");
        }
        break;
      case "ohlc":
        newSettings.clustered = false;
        series = mainPanel.series.push(am5xy.OHLCSeries.new(root, newSettings));
        break;
    }

    // Set new series as stockSeries
    if (series) {
      valueLegend.data.removeValue(currentSeries);
      series.data.setAll(data);
      stockChart.set("stockSeries", series);
      const cursor = mainPanel.get("cursor");
      if (cursor) {
        cursor.set("snapToSeries", [series]);
      }
      valueLegend.data.insertIndex(0, series);
      
      // Update visible tick count after series type change
      series.events.once("datavalidated", function() {
        // Get the current visible range
        const xAxis = mainPanel.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRenderer>;
        if (xAxis && xAxis.getPrivate("selectionMin") && xAxis.getPrivate("selectionMax")) {
          const from = xAxis.getPrivate("selectionMin") as number / 1000;
          const to = xAxis.getPrivate("selectionMax") as number / 1000;
          
          // Calculate visible tick count
          const count = calculateVisibleTickCount(data, from, to);
          
          // Directly update the UI component
          try {
            // @ts-ignore
            if (typeof window !== 'undefined' && window.updateTickCount) {
              // @ts-ignore
              window.updateTickCount(count);
            }
          } catch (e) {
            console.error('Error updating tick count:', e);
          }
          
          console.log(`Updated visible tick count after series type change: ${count}`);
        }
      });
    }
  }

  // Set up series type switcher
  const seriesSwitcher = am5stock.SeriesTypeControl.new(root, {
    stockChart: stockChart
  });

  seriesSwitcher.events.on("selected", function(ev) {
    // Ensure ev.item is an object and has property id
    const item = typeof ev.item === 'object' ? ev.item as any : { id: ev.item };
    setSeriesType(item.id as string);
  });

  return seriesSwitcher;
};

/**
 * Configure event listeners for chart interactions
 */
export const configureChartEvents = (
  dateAxis: am5xy.DateAxis<am5xy.AxisRenderer>,
  mainPanel: am5stock.StockPanel,
  data: any[],
  onVisibleRangeChangeWithGranularity?: (range: { from: number; to: number; visibleRangeNs: number }) => void,
  lastVisibleRangeRef?: React.MutableRefObject<{ from: number; to: number } | null>,
  visibleTickCountRef?: React.MutableRefObject<number>
) => {
  if (!onVisibleRangeChangeWithGranularity) return;

  // Helper function to update the visible tick count
  const updateVisibleTickCount = (from: number, to: number) => {
    if (data) {
      const count = calculateVisibleTickCount(data, from, to);
      
      // Update the ref
      if (visibleTickCountRef) {
        visibleTickCountRef.current = count;
      }
      
      // Directly update the UI component
      try {
        // @ts-ignore
        if (typeof window !== 'undefined' && window.updateTickCount) {
          // @ts-ignore
          window.updateTickCount(count);
        }
      } catch (e) {
        console.error('Error updating tick count:', e);
      }
      
      console.log(`Updated visible tick count: ${count}`);
    }
  };

  // Using a type assertion to bypass type checking for this event name
  (dateAxis.events as any).on("selectionextremeschanged", () => {
    if (dateAxis.getPrivate("selectionMin") && dateAxis.getPrivate("selectionMax")) {
      const from = dateAxis.getPrivate("selectionMin") as number / 1000;
      const to = dateAxis.getPrivate("selectionMax") as number / 1000;
      
      // Only trigger if the range has changed significantly
      if (!lastVisibleRangeRef?.current || 
          Math.abs(from - (lastVisibleRangeRef.current.from || 0)) > 0.01 ||
          Math.abs(to - (lastVisibleRangeRef.current.to || 0)) > 0.01) {
        
        const visibleRangeNs = Math.floor((to - from) * 1_000_000_000);
        
        // Update visible tick count
        updateVisibleTickCount(from, to);
        
        if (onVisibleRangeChangeWithGranularity) {
          onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
        }
        
        // Update last visible range
        if (lastVisibleRangeRef) {
          lastVisibleRangeRef.current = { from, to };
        }
      }
    }
  });
  
  // Also listen for zoom end events as an alternative trigger
  (dateAxis.events as any).on("xaxiszoomended", () => {
    if (dateAxis.getPrivate("selectionMin") && dateAxis.getPrivate("selectionMax")) {
      const from = dateAxis.getPrivate("selectionMin") as number / 1000;
      const to = dateAxis.getPrivate("selectionMax") as number / 1000;
      
      // Update visible tick count
      updateVisibleTickCount(from, to);
    }
  });
  
  // Listen for any zoom events on the main panel
  mainPanel.events.on("wheel", () => {
    // Use setTimeout to ensure we get the updated range after the zoom completes
    setTimeout(() => {
      if (dateAxis.getPrivate("selectionMin") && dateAxis.getPrivate("selectionMax")) {
        const from = dateAxis.getPrivate("selectionMin") as number / 1000;
        const to = dateAxis.getPrivate("selectionMax") as number / 1000;
        
        // Update visible tick count
        updateVisibleTickCount(from, to);
      }
    }, 50); // Small delay to ensure the zoom has completed
  });
  
  // Set up a MutationObserver to monitor changes to the chart's DOM
  // This is a more comprehensive approach to catch all zoom events
  try {
    if (typeof window !== 'undefined' && window.MutationObserver) {
      const chartDiv = mainPanel.root.dom;
      if (chartDiv) {
        // Create a throttled update function to avoid too many updates
        let throttleTimeout: any = null;
        const throttledUpdate = () => {
          if (throttleTimeout) {
            clearTimeout(throttleTimeout);
          }
          throttleTimeout = setTimeout(() => {
            if (dateAxis.getPrivate("selectionMin") && dateAxis.getPrivate("selectionMax")) {
              const from = dateAxis.getPrivate("selectionMin") as number / 1000;
              const to = dateAxis.getPrivate("selectionMax") as number / 1000;
              
              // Update visible tick count
              updateVisibleTickCount(from, to);
            }
          }, 100); // Throttle to avoid too many updates
        };
        
        // Create a MutationObserver to watch for changes to the chart
        const observer = new MutationObserver(throttledUpdate);
        
        // Start observing the chart container for attribute changes
        observer.observe(chartDiv, { 
          attributes: true, 
          childList: true, 
          subtree: true,
          attributeFilter: ['transform', 'width', 'height', 'd'] 
        });
        
        // Clean up the observer when the chart is disposed
        mainPanel.events.once("disposed" as any, () => {
          observer.disconnect();
        });
      }
    }
  } catch (e) {
    console.error('Error setting up MutationObserver:', e);
  }
  
  // Add scrollbar range changed event listener
  const scrollbarX = mainPanel.get("scrollbarX") as am5xy.XYChartScrollbar;
  scrollbarX.events.on("rangechanged", (e) => {
    // The scrollbar's range is normalized from 0-1
    // We need to convert this to the actual time range
    if (dateAxis.getPrivate("min") !== undefined && dateAxis.getPrivate("max") !== undefined) {
      const axisMin = dateAxis.getPrivate("min") as number;
      const axisMax = dateAxis.getPrivate("max") as number;
      const axisRange = axisMax - axisMin;
      
      // Convert normalized range (0-1) to actual time range
      const fromMs = axisMin + axisRange * e.start;
      const toMs = axisMin + axisRange * e.end;
      
      // Convert from milliseconds to seconds
      const from = fromMs / 1000;
      const to = toMs / 1000;
      
      // Update visible tick count
      updateVisibleTickCount(from, to);
      
      // Update the visible range reference
      if (lastVisibleRangeRef) {
        lastVisibleRangeRef.current = { from, to };
      }
    }
  });
}; 