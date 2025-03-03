import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5stock from '@amcharts/amcharts5/stock';
import { GRANULARITIES, Granularity, getIntervalForGranularity } from '../types/Granularity';
import { DEFAULT_GRANULARITY } from './chartDefaults';
import { hasOHLCFormat, calculateVisibleTickCount } from './chartDataTransform';

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
  const allowedGranularities = ['1s', '1m', '5m', '1h', '1d'];
  
  const intervalItems = Object.values(GRANULARITIES)
    .filter(gran => allowedGranularities.includes(gran.symbol))
    .map((gran) => {
      const interval = getIntervalForGranularity(gran);
      return {
        id: gran.symbol,
        label: gran.name,
        interval,
        granularity: gran
      };
    });

  const intervalSwitcher = am5stock.IntervalControl.new(root, {
    stockChart: stockChart,
    items: intervalItems
  });

  if (currentGranularity) {
    const matchingItem = intervalItems.find(item => {
      if (typeof item === 'string') {
        return false;
      }
      return item.id === currentGranularity.symbol;
    });
    if (matchingItem && typeof matchingItem !== 'string') {
      dateAxis.set("baseInterval", matchingItem.interval);
      sbDateAxis.set("baseInterval", matchingItem.interval);
    }
  }

  intervalSwitcher.events.on("selected", function(ev) {
    const item = typeof ev.item === 'object' ? ev.item as any : { 
      interval: getIntervalForGranularity(currentGranularity || DEFAULT_GRANULARITY), 
      granularity: currentGranularity || DEFAULT_GRANULARITY, 
      id: (currentGranularity || DEFAULT_GRANULARITY).symbol 
    };

    const selectedGran = item.granularity;
    
    dateAxis.set("baseInterval", item.interval);
    sbDateAxis.set("baseInterval", item.interval);
    
    stockChart.indicators.each(function(indicator){
      if (indicator instanceof am5stock.ChartIndicator) {
        indicator.xAxis.set("baseInterval", item.interval);
      }
    });
    
    if (onGranularityChange) {
      onGranularityChange(selectedGran);
    }
  });

  return intervalSwitcher;
};

export const configureSeriesSwitcher = (
  root: am5.Root,
  stockChart: am5stock.StockChart,
  mainPanel: am5stock.StockPanel,
  valueLegend: am5stock.StockLegend
) => {
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

  function setSeriesType(seriesType: string) {
    const currentSeries = stockChart.get("stockSeries");
    if (!currentSeries) return;
    
    const newSettings = getNewSettings(currentSeries);

    const data = currentSeries.data.values;
    mainPanel.series.removeValue(currentSeries);

    let series;
    switch (seriesType) {
      case "line":
        series = mainPanel.series.push(am5xy.LineSeries.new(root, {
          ...newSettings, 
          connect: false,
          autoGapCount: 1.1,
          minDistance: 0,
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

    if (series) {
      valueLegend.data.removeValue(currentSeries);
      series.data.setAll(data);
      stockChart.set("stockSeries", series);
      const cursor = mainPanel.get("cursor");
      if (cursor) {
        cursor.set("snapToSeries", [series]);
      }
      valueLegend.data.insertIndex(0, series);
      
      series.events.once("datavalidated", function() {
        const xAxis = mainPanel.xAxes.getIndex(0) as am5xy.DateAxis<am5xy.AxisRenderer>;
        if (xAxis && xAxis.getPrivate("selectionMin") && xAxis.getPrivate("selectionMax")) {
          const from = xAxis.getPrivate("selectionMin") as number / 1000;
          const to = xAxis.getPrivate("selectionMax") as number / 1000;
          
          const count = calculateVisibleTickCount(data, from, to);
          
          try {
            if (typeof window !== 'undefined' && (window as any).updateTickCount) {
              (window as any).updateTickCount(count);
            }
          } catch (e) {
            console.error('Error updating tick count:', e);
          }
        }
      });
    }
  }

  const seriesSwitcher = am5stock.SeriesTypeControl.new(root, {
    stockChart: stockChart
  });

  seriesSwitcher.events.on("selected", function(ev) {
    const item = typeof ev.item === 'object' ? ev.item as any : { id: ev.item };
    setSeriesType(item.id as string);
  });

  return seriesSwitcher;
};

export const configureChartEvents = (
  dateAxis: am5xy.DateAxis<am5xy.AxisRenderer>,
  mainPanel: am5stock.StockPanel,
  data: any[],
  onVisibleRangeChangeWithGranularity?: (range: { from: number; to: number; visibleRangeNs: number }) => void,
  lastVisibleRangeRef?: React.MutableRefObject<{ from: number; to: number } | null>,
  visibleTickCountRef?: React.MutableRefObject<number>
) => {
  if (!onVisibleRangeChangeWithGranularity) return;

  const updateVisibleTickCount = (from: number, to: number) => {
    if (data) {
      const count = calculateVisibleTickCount(data, from, to);
      
      if (visibleTickCountRef) {
        visibleTickCountRef.current = count;
      }
      
      try {
        if (typeof window !== 'undefined' && (window as any).updateTickCount) {
          (window as any).updateTickCount(count);
        }
      } catch (e) {
        console.error('Error updating tick count:', e);
      }
    }
  };

  (dateAxis.events as any).on("selectionextremeschanged", () => {
    if (dateAxis.getPrivate("selectionMin") && dateAxis.getPrivate("selectionMax")) {
      const from = dateAxis.getPrivate("selectionMin") as number / 1000;
      const to = dateAxis.getPrivate("selectionMax") as number / 1000;
      
      if (!lastVisibleRangeRef?.current || 
          Math.abs(from - (lastVisibleRangeRef.current.from || 0)) > 0.01 ||
          Math.abs(to - (lastVisibleRangeRef.current.to || 0)) > 0.01) {
        
        const visibleRangeNs = Math.floor((to - from) * 1_000_000_000);
        
        updateVisibleTickCount(from, to);
        
        if (onVisibleRangeChangeWithGranularity) {
          onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
        }
        
        if (lastVisibleRangeRef) {
          lastVisibleRangeRef.current = { from, to };
        }
      }
    }
  });
  
  (dateAxis.events as any).on("xaxiszoomended", () => {
    if (dateAxis.getPrivate("selectionMin") && dateAxis.getPrivate("selectionMax")) {
      const from = dateAxis.getPrivate("selectionMin") as number / 1000;
      const to = dateAxis.getPrivate("selectionMax") as number / 1000;
      
      updateVisibleTickCount(from, to);
    }
  });
  
  mainPanel.events.on("wheel", () => {
    setTimeout(() => {
      if (dateAxis.getPrivate("selectionMin") && dateAxis.getPrivate("selectionMax")) {
        const from = dateAxis.getPrivate("selectionMin") as number / 1000;
        const to = dateAxis.getPrivate("selectionMax") as number / 1000;
        
        updateVisibleTickCount(from, to);
      }
    }, 50);
  });
  
  try {
    if (typeof window !== 'undefined' && (window as any).MutationObserver) {
      const chartDiv = mainPanel.root.dom;
      if (chartDiv) {
        let throttleTimeout: any = null;
        const throttledUpdate = () => {
          if (throttleTimeout) {
            clearTimeout(throttleTimeout);
          }
          throttleTimeout = setTimeout(() => {
            if (dateAxis.getPrivate("selectionMin") && dateAxis.getPrivate("selectionMax")) {
              const from = dateAxis.getPrivate("selectionMin") as number / 1000;
              const to = dateAxis.getPrivate("selectionMax") as number / 1000;
              
              updateVisibleTickCount(from, to);
            }
          }, 100);
        };
        
        const observer = new MutationObserver(throttledUpdate);
        
        observer.observe(chartDiv, { 
          attributes: true, 
          childList: true, 
          subtree: true,
          attributeFilter: ['transform', 'width', 'height', 'd'] 
        });
        
        mainPanel.events.once("disposed" as any, () => {
          observer.disconnect();
        });
      }
    }
  } catch (e) {
    console.error('Error setting up MutationObserver:', e);
  }
  
  const scrollbarX = mainPanel.get("scrollbarX") as am5xy.XYChartScrollbar;
  scrollbarX.events.on("rangechanged", (e) => {
    if (dateAxis.getPrivate("min") !== undefined && dateAxis.getPrivate("max") !== undefined) {
      const axisMin = dateAxis.getPrivate("min") as number;
      const axisMax = dateAxis.getPrivate("max") as number;
      const axisRange = axisMax - axisMin;
      
      const fromMs = axisMin + axisRange * e.start;
      const toMs = axisMin + axisRange * e.end;
      
      const from = fromMs / 1000;
      const to = toMs / 1000;
      
      updateVisibleTickCount(from, to);
      
      if (lastVisibleRangeRef) {
        lastVisibleRangeRef.current = { from, to };
      }
    }
  });
};