import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5stock from '@amcharts/amcharts5/stock';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';

// Define the props interface
interface AmChartsStockChartProps {
  data: any[];
  onVisibleRangeChangeWithGranularity?: (range: { from: number; to: number; visibleRangeNs: number }) => void;
  height?: number;
  width?: number;
}

// Define the handle interface for ref
export interface AmChartsStockChartHandle {
  fitContent: () => void;
  resetFitContent: () => void;
  getVisibleRange: () => { from: number; to: number } | null;
  getVisibleLogicalRange: () => { from: number; to: number } | null;
}

const AmChartsStockChart = forwardRef<AmChartsStockChartHandle, AmChartsStockChartProps>(({
  data,
  onVisibleRangeChangeWithGranularity,
  height = 500,
  width = 800,
}, ref) => {
  const chartDivRef = useRef<HTMLDivElement>(null);
  const controlsDivRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<am5.Root | null>(null);
  const stockChartRef = useRef<am5stock.StockChart | null>(null);
  const mainPanelRef = useRef<am5stock.StockPanel | null>(null);
  const shouldFitOnNextLoadRef = useRef(true);
  const lastVisibleRangeRef = useRef<{ from: number; to: number } | null>(null);
  const currentGranularityRef = useRef<string>("second");

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
    }
  }));

  // Function to load data
  const loadData = (series: any[], chartData: any[]) => {
    // Set data for all series
    series.forEach(item => {
      if (item && item.data) {
        item.data.setAll(chartData);
      }
    });
  };

  // Initialize chart
  useEffect(() => {
    if (!chartDivRef.current || !controlsDivRef.current) return;

    // Dispose of previous chart if it exists
    if (rootRef.current) {
      rootRef.current.dispose();
    }

    // Create root element
    const root = am5.Root.new(chartDivRef.current);
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
    const hasOHLCData = data.length > 0 && data[0].open !== undefined && data[0].high !== undefined && 
                        data[0].low !== undefined && data[0].close !== undefined;

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
    const seriesSwitcher = am5stock.SeriesTypeControl.new(root, {
      stockChart: stockChart
    });

    seriesSwitcher.events.on("selected", function(ev) {
      setSeriesType(ev.item.id);
    });

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
          series = mainPanel.series.push(am5xy.LineSeries.new(root, newSettings));
          break;
        case "candlestick":
        case "procandlestick":
          newSettings.clustered = false;
          series = mainPanel.series.push(am5xy.CandlestickSeries.new(root, newSettings));
          if (seriesType == "procandlestick") {
            series.columns.template.get("themeTags").push("pro");
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
      }
    }

    // Interval switcher
    const intervalSwitcher = am5stock.IntervalControl.new(root, {
      stockChart: stockChart,
      items: [
        { id: "1 second", label: "1 second", interval: { timeUnit: "second", count: 1 } },
        { id: "1 minute", label: "1 minute", interval: { timeUnit: "minute", count: 1 } },
        { id: "1 hour", label: "1 hour", interval: { timeUnit: "hour", count: 1 } }
      ]
    });

    intervalSwitcher.events.on("selected", function(ev) {
      // Determine selected granularity
      currentGranularityRef.current = ev.item.interval.timeUnit;
      
      // Get series
      const valueSeries = stockChart.get("stockSeries");
      const volumeSeries = stockChart.get("volumeSeries");
      
      // Set up zoomout
      if (valueSeries) {
        valueSeries.events.once("datavalidated", function() {
          mainPanel.zoomOut();
        });
      }
      
      // Once data loading is done, set `baseInterval` on the DateAxis
      dateAxis.set("baseInterval", ev.item.interval);
      sbDateAxis.set("baseInterval", ev.item.interval);
      
      stockChart.indicators.each(function(indicator){
        if (indicator instanceof am5stock.ChartIndicator) {
          indicator.xAxis.set("baseInterval", ev.item.interval);
        }
      });
      
      // Notify parent component of range change
      if (onVisibleRangeChangeWithGranularity && dateAxis.getPrivate("selectionMin") && dateAxis.getPrivate("selectionMax")) {
        const from = dateAxis.getPrivate("selectionMin") as number / 1000;
        const to = dateAxis.getPrivate("selectionMax") as number / 1000;
        const visibleRangeNs = Math.floor((to - from) * 1_000_000_000);
        onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
      }
    });

    // Stock toolbar
    const toolbar = am5stock.StockToolbar.new(root, {
      container: controlsDivRef.current,
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

    // Handle range changes
    if (onVisibleRangeChangeWithGranularity) {
      dateAxis.events.on("selectionextremeschanged", () => {
        if (dateAxis.getPrivate("selectionMin") && dateAxis.getPrivate("selectionMax")) {
          const from = dateAxis.getPrivate("selectionMin") as number / 1000;
          const to = dateAxis.getPrivate("selectionMax") as number / 1000;
          
          // Only trigger if the range has changed significantly
          if (!lastVisibleRangeRef.current || 
              Math.abs(from - (lastVisibleRangeRef.current.from || 0)) > 0.01 ||
              Math.abs(to - (lastVisibleRangeRef.current.to || 0)) > 0.01) {
            
            const visibleRangeNs = Math.floor((to - from) * 1_000_000_000);
            onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
            
            // Update last visible range
            lastVisibleRangeRef.current = { from, to };
          }
        }
      });
    }

    // Convert data to amCharts format
    if (data.length > 0) {
      const chartData = data.map(item => {
        if (hasOHLCData) {
          return {
            time: new Date(item.time * 1000).getTime(),
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume || 0
          };
        } else {
          return {
            time: new Date(item.time * 1000).getTime(),
            value: item.value
          };
        }
      });
      
      // Load data for all series
      const seriesToLoad = [valueSeries, sbSeries];
      if (hasOHLCData && volumeSeries) {
        seriesToLoad.push(volumeSeries);
      }
      
      loadData(seriesToLoad, chartData);
    }

    // Handle resize
    const handleResize = () => {
      if (chartDivRef.current && rootRef.current) {
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
  }, []);

  // Update data when it changes
  useEffect(() => {
    if (stockChartRef.current && data.length > 0) {
      // Check if we have OHLC data
      const hasOHLCData = data[0].open !== undefined && data[0].high !== undefined && 
                          data[0].low !== undefined && data[0].close !== undefined;
      
      // Convert data to amCharts format
      const chartData = data.map(item => {
        if (hasOHLCData) {
          return {
            time: new Date(item.time * 1000).getTime(),
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume || 0
          };
        } else {
          return {
            time: new Date(item.time * 1000).getTime(),
            value: item.value
          };
        }
      });
      
      // Get all series that need to be updated
      const valueSeries = stockChartRef.current.get("stockSeries");
      const volumeSeries = stockChartRef.current.get("volumeSeries");
      
      const seriesToUpdate = [valueSeries];
      if (hasOHLCData && volumeSeries) {
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
      loadData(seriesToUpdate, chartData);
      
      // Fit content if needed
      if (shouldFitOnNextLoadRef.current && mainPanelRef.current) {
        mainPanelRef.current.zoomOut();
        shouldFitOnNextLoadRef.current = false;
      }
    }
  }, [data]);

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

export default AmChartsStockChart; 