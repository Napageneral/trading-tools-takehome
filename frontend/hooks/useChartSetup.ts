/**
 * Custom hook for setting up the amCharts chart
 */
import { useEffect, useRef } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5stock from '@amcharts/amcharts5/stock';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';
import { Granularity } from '../types/Granularity';
import { 
  configureIntervalSwitcher, 
  configureSeriesSwitcher,
  configureChartEvents
} from '../utils/chartConfigHelpers';
import { hasOHLCFormat, transformDataForChart } from '../utils/chartDataTransform';

interface ChartSetupProps {
  chartDiv: HTMLDivElement | null;
  controlsDiv: HTMLDivElement | null;
  data: any[];
  onVisibleRangeChangeWithGranularity?: (range: { from: number; to: number; visibleRangeNs: number }) => void;
  onGranularityChange?: (granularity: Granularity) => void;
  currentGranularity?: Granularity;
  shouldFitOnNextLoadRef: React.MutableRefObject<boolean>;
  lastVisibleRangeRef: React.MutableRefObject<{ from: number; to: number } | null>;
  currentGranularityRef: React.MutableRefObject<Granularity | null>;
  intervalSwitcherRef: React.MutableRefObject<am5stock.IntervalControl | null>;
  visibleTickCountRef: React.MutableRefObject<number>;
}

interface ChartRefs {
  rootRef: React.MutableRefObject<am5.Root | null>;
  stockChartRef: React.MutableRefObject<am5stock.StockChart | null>;
  mainPanelRef: React.MutableRefObject<am5stock.StockPanel | null>;
}

/**
 * Custom hook to set up and initialize amCharts
 */
export const useChartSetup = (
  props: ChartSetupProps,
  refs: ChartRefs
): void => {
  const { 
    chartDiv,
    controlsDiv,
    data,
    onVisibleRangeChangeWithGranularity,
    onGranularityChange,
    currentGranularity,
    shouldFitOnNextLoadRef,
    lastVisibleRangeRef,
    currentGranularityRef,
    intervalSwitcherRef,
    visibleTickCountRef
  } = props;

  const { 
    rootRef,
    stockChartRef,
    mainPanelRef
  } = refs;

  const valueSeriesRef = useRef<any>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartDiv || !controlsDiv) return;

    // Dispose of previous chart if it exists
    if (rootRef.current) {
      rootRef.current.dispose();
    }

    // Create root element
    const root = am5.Root.new(chartDiv);
    rootRef.current = root;

    // Create custom theme
    const myTheme = am5.Theme.new(root);
    myTheme.rule("Grid", ["scrollbar", "minor"]).setAll({
      visible: false
    });

    // Set themes
    root.setThemes([
      am5themes_Animated.new(root),
      myTheme
    ]);

    // Set global number format
    root.numberFormatter.set("numberFormat", "#,###.00");
    
    // Set date format to show hours, minutes, and seconds
    root.dateFormatter.setAll({
      dateFormat: "yyyy-MM-dd HH:mm:ss",
      dateFields: ["time"]
    });

    // Create stock chart
    const stockChart = root.container.children.push(
      am5stock.StockChart.new(root, {})
    );
    stockChartRef.current = stockChart;

    // Create main panel (chart)
    const mainPanel = stockChart.panels.push(
      am5stock.StockPanel.new(root, {
        wheelY: "zoomX",
        panX: true,
        panY: true
      })
    );
    mainPanelRef.current = mainPanel;

    // Create value axis
    const valueAxis = mainPanel.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {
          pan: "zoom"
        }),
        extraMin: 0.1, // adds some space for main series
        tooltip: am5.Tooltip.new(root, {}),
        numberFormat: "#,###.00",
        extraTooltipPrecision: 2
      })
    );

    // Create date axis
    const dateAxis = mainPanel.xAxes.push(
      am5xy.GaplessDateAxis.new(root, {
        baseInterval: {
          timeUnit: "second",
          count: 1
        },
        renderer: am5xy.AxisRendererX.new(root, {
          minorGridEnabled: true
        }),
        tooltip: am5.Tooltip.new(root, {})
      })
    );

    // Check if we have OHLC data
    const hasOHLCData = hasOHLCFormat(data);

    // Add series
    let valueSeries;
    
    if (hasOHLCData) {
      // Create candlestick series
      valueSeries = mainPanel.series.push(
        am5xy.CandlestickSeries.new(root, {
          name: "Value",
          xAxis: dateAxis,
          yAxis: valueAxis,
          valueYField: "close",
          openValueYField: "open",
          lowValueYField: "low",
          highValueYField: "high",
          valueXField: "time",
          calculateAggregates: true,
          clustered: false,
          tooltip: am5.Tooltip.new(root, {
            labelText: "Open: {openValueY}\nHigh: {highValueY}\nLow: {lowValueY}\nClose: {valueY}"
          }),
          legendValueText: "open: [bold]{openValueY}[/] high: [bold]{highValueY}[/] low: [bold]{lowValueY}[/] close: [bold]{valueY}[/]",
          legendRangeValueText: ""
        })
      );
    } else {
      // Create line series for regular data
      valueSeries = mainPanel.series.push(
        am5xy.LineSeries.new(root, {
          name: "Value",
          xAxis: dateAxis,
          yAxis: valueAxis,
          valueYField: "value",
          valueXField: "time",
          calculateAggregates: true,
          tooltip: am5.Tooltip.new(root, {
            labelText: "Value: {valueY}"
          })
        })
      );
      
      valueSeries.strokes.template.setAll({
        strokeWidth: 2
      });
    }

    valueSeriesRef.current = valueSeries;

    // Set main value series
    stockChart.set("stockSeries", valueSeries);

    // Add stock legend
    const valueLegend = mainPanel.plotContainer.children.push(
      am5stock.StockLegend.new(root, {
        stockChart: stockChart
      })
    );

    // Create volume axis
    const volumeAxisRenderer = am5xy.AxisRendererY.new(root, {});
    volumeAxisRenderer.labels.template.set("forceHidden", true);
    volumeAxisRenderer.grid.template.set("forceHidden", true);

    const volumeValueAxis = mainPanel.yAxes.push(
      am5xy.ValueAxis.new(root, {
        numberFormat: "#.#a",
        height: am5.percent(20),
        y: am5.percent(100),
        centerY: am5.percent(100),
        renderer: volumeAxisRenderer
      })
    );

    // Add volume series
    let volumeSeries;
    
    if (hasOHLCData) {
      volumeSeries = mainPanel.series.push(
        am5xy.ColumnSeries.new(root, {
          name: "Volume",
          clustered: false,
          valueXField: "time",
          valueYField: "volume",
          xAxis: dateAxis,
          yAxis: volumeValueAxis,
          legendValueText: "[bold]{valueY.formatNumber('#,###.0a')}[/]"
        })
      );
      
      volumeSeries.columns.template.setAll({
        strokeOpacity: 0,
        fillOpacity: 0.5
      });
      
      // Color volume columns by price movement
      volumeSeries.columns.template.adapters.add("fill", function(fill, target) {
        const dataItem = target.dataItem;
        if (dataItem) {
          return stockChart.getVolumeColor(dataItem);
        }
        return fill;
      });
      
      // Set main series
      stockChart.set("volumeSeries", volumeSeries);
      valueLegend.data.setAll([valueSeries, volumeSeries]);
    } else {
      valueLegend.data.setAll([valueSeries]);
    }

    // Add cursor
    mainPanel.set("cursor", am5xy.XYCursor.new(root, {
      yAxis: valueAxis,
      xAxis: dateAxis,
      snapToSeries: [valueSeries],
      snapToSeriesBy: "y!"
    }));

    // Add scrollbar
    const scrollbar = mainPanel.set("scrollbarX", am5xy.XYChartScrollbar.new(root, {
      orientation: "horizontal",
      height: 50
    }));
    stockChart.toolsContainer.children.push(scrollbar);

    const sbDateAxis = scrollbar.chart.xAxes.push(
      am5xy.GaplessDateAxis.new(root, {
        baseInterval: {
          timeUnit: "second",
          count: 1
        },
        renderer: am5xy.AxisRendererX.new(root, {
          minorGridEnabled: true
        })
      })
    );

    const sbValueAxis = scrollbar.chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {})
      })
    );

    const sbSeries = scrollbar.chart.series.push(
      am5xy.LineSeries.new(root, {
        valueYField: hasOHLCData ? "close" : "value",
        valueXField: "time",
        xAxis: sbDateAxis,
        yAxis: sbValueAxis
      })
    );

    sbSeries.fills.template.setAll({
      visible: true,
      fillOpacity: 0.3
    });

    // Set up series type switcher
    const seriesSwitcher = configureSeriesSwitcher(
      root,
      stockChart,
      mainPanel,
      valueLegend
    );

    // Set up interval switcher
    const intervalSwitcher = configureIntervalSwitcher(
      root,
      stockChart,
      dateAxis,
      sbDateAxis,
      currentGranularity,
      mainPanel,
      valueSeries,
      onGranularityChange,
      onVisibleRangeChangeWithGranularity
    );
    
    intervalSwitcherRef.current = intervalSwitcher;

    // Configure chart events
    configureChartEvents(
      dateAxis,
      mainPanel,
      data,
      onVisibleRangeChangeWithGranularity,
      lastVisibleRangeRef,
      visibleTickCountRef
    );

    // Stock toolbar
    const toolbar = am5stock.StockToolbar.new(root, {
      container: controlsDiv,
      stockChart: stockChart,
      controls: [
        am5stock.IndicatorControl.new(root, {
          stockChart: stockChart,
          legend: valueLegend
        }),
        am5stock.DateRangeSelector.new(root, {
          stockChart: stockChart
        }),
        am5stock.PeriodSelector.new(root, {
          stockChart: stockChart
        }),
        intervalSwitcher,
        seriesSwitcher,
        am5stock.DrawingControl.new(root, {
          stockChart: stockChart
        }),
        am5stock.ResetControl.new(root, {
          stockChart: stockChart
        }),
        am5stock.SettingsControl.new(root, {
          stockChart: stockChart
        })
      ]
    });

    // Load data
    if (data.length > 0) {
      const chartData = transformDataForChart(data);
      
      // Load data for all series
      const seriesToLoad = [valueSeries, sbSeries];
      if (hasOHLCData && volumeSeries) {
        seriesToLoad.push(volumeSeries as any);
      }
      
      // Load data into series
      seriesToLoad.forEach(item => {
        if (item && item.data) {
          item.data.setAll(chartData);
        }
      });
    }

    // Handle resize
    const handleResize = () => {
      if (chartDiv && rootRef.current) {
        rootRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rootRef.current) {
        rootRef.current.dispose();
      }
    };
  }, [
    chartDiv, 
    controlsDiv, 
    onVisibleRangeChangeWithGranularity, 
    onGranularityChange, 
    currentGranularity
  ]);

  // Update chart data
  useEffect(() => {
    if (!stockChartRef.current || data.length === 0) return;

    const chartData = transformDataForChart(data);
    
    // Get all series that need to be updated
    const valueSeries = stockChartRef.current.get("stockSeries");
    const volumeSeries = stockChartRef.current.get("volumeSeries");
    
    const seriesToUpdate = [valueSeries];
    if (hasOHLCFormat(data) && volumeSeries) {
      seriesToUpdate.push(volumeSeries);
    }
    
    // Get scrollbar series
    if (mainPanelRef.current) {
      const scrollbar = mainPanelRef.current.get("scrollbarX") as am5xy.XYChartScrollbar;
      if (scrollbar && scrollbar.chart) {
        const sbSeries = scrollbar.chart.series.getIndex(0);
        if (sbSeries) {
          seriesToUpdate.push(sbSeries);
        }
      }
    }
    
    // Update data for all series
    seriesToUpdate.forEach(item => {
      if (item && item.data) {
        item.data.setAll(chartData);
      }
    });
    
    // Fit content if needed
    if (shouldFitOnNextLoadRef.current && mainPanelRef.current) {
      mainPanelRef.current.zoomOut();
      shouldFitOnNextLoadRef.current = false;
    }
  }, [data, shouldFitOnNextLoadRef]);

  // Update current interval when granularity changes
  useEffect(() => {
    if (currentGranularity && intervalSwitcherRef.current) {
      // Find the item that matches the granularity
      const items = intervalSwitcherRef.current.get("items") || [];
      const matchingItemIndex = items.findIndex((item: any) => item.id === currentGranularity.symbol);
      
      if (matchingItemIndex >= 0) {
        // Set the selected index using type assertion
        (intervalSwitcherRef.current as any).set("selectedIndex", matchingItemIndex);
      }
    }
  }, [currentGranularity, intervalSwitcherRef]);
}; 