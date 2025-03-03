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

  useEffect(() => {
    if (!chartDiv || !controlsDiv) return;

    if (rootRef.current) {
      rootRef.current.dispose();
    }

    const root = am5.Root.new(chartDiv);
    rootRef.current = root;

    const myTheme = am5.Theme.new(root);
    myTheme.rule("Grid", ["scrollbar", "minor"]).setAll({
      visible: false
    });

    root.setThemes([
      am5themes_Animated.new(root),
      myTheme
    ]);

    root.numberFormatter.set("numberFormat", "#,###.00");
    
    root.dateFormatter.setAll({
      dateFormat: "yyyy-MM-dd HH:mm:ss",
      dateFields: ["time"]
    });

    const stockChart = root.container.children.push(
      am5stock.StockChart.new(root, {})
    );
    stockChartRef.current = stockChart;

    const mainPanel = stockChart.panels.push(
      am5stock.StockPanel.new(root, {
        wheelY: "zoomX",
        panX: true,
        panY: true
      })
    );
    mainPanelRef.current = mainPanel;

    const valueAxis = mainPanel.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {
          pan: "zoom"
        }),
        extraMin: 0.1,
        tooltip: am5.Tooltip.new(root, {}),
        numberFormat: "#,###.00",
        extraTooltipPrecision: 2
      })
    );

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

    const hasOHLCData = hasOHLCFormat(data);

    let valueSeries;
    
    if (hasOHLCData) {
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
          }),
          connect: false,
          autoGapCount: 1.1,
          minDistance: 0
        })
      );
      
      valueSeries.strokes.template.setAll({
        strokeWidth: 2
      });
    }

    valueSeriesRef.current = valueSeries;

    stockChart.set("stockSeries", valueSeries);

    const valueLegend = mainPanel.plotContainer.children.push(
      am5stock.StockLegend.new(root, {
        stockChart: stockChart
      })
    );

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
      
      volumeSeries.columns.template.adapters.add("fill", function(fill, target) {
        const dataItem = target.dataItem;
        if (dataItem) {
          return stockChart.getVolumeColor(dataItem);
        }
        return fill;
      });
      
      stockChart.set("volumeSeries", volumeSeries);
      valueLegend.data.setAll([valueSeries, volumeSeries]);
    } else {
      valueLegend.data.setAll([valueSeries]);
    }

    mainPanel.set("cursor", am5xy.XYCursor.new(root, {
      yAxis: valueAxis,
      xAxis: dateAxis,
      snapToSeries: [valueSeries],
      snapToSeriesBy: "y!"
    }));

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
        yAxis: sbValueAxis,
        connect: false
      })
    );

    sbSeries.fills.template.setAll({
      visible: true,
      fillOpacity: 0.3
    });

    const seriesSwitcher = configureSeriesSwitcher(
      root,
      stockChart,
      mainPanel,
      valueLegend
    );

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

    configureChartEvents(
      dateAxis,
      mainPanel,
      data,
      onVisibleRangeChangeWithGranularity,
      lastVisibleRangeRef,
      visibleTickCountRef
    );

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

    try {
      if (stockChart.indicators) {
        stockChart.indicators.clear();
      }
      
      if (mainPanel.children) {
        mainPanel.children.each((child) => {
          if (child.className && (
            child.className.indexOf("TrendLine") >= 0 || 
            child.className.indexOf("Regression") >= 0)) {
            mainPanel.children.removeValue(child);
          }
        });
      }
    } catch (e) {
      console.warn("Error removing trend lines:", e);
    }

    if (data.length > 0) {
      const chartData = transformDataForChart(data);
      
      const seriesToLoad = [valueSeries, sbSeries];
      if (hasOHLCData && volumeSeries) {
        seriesToLoad.push(volumeSeries as any);
      }
      
      seriesToLoad.forEach(item => {
        if (item && item.data) {
          item.data.setAll(chartData);
        }
      });
    }

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

  useEffect(() => {
    if (!stockChartRef.current || data.length === 0) return;

    const chartData = transformDataForChart(data);
    
    const valueSeries = stockChartRef.current.get("stockSeries");
    const volumeSeries = stockChartRef.current.get("volumeSeries");
    
    const seriesToUpdate = [valueSeries];
    if (hasOHLCFormat(data) && volumeSeries) {
      seriesToUpdate.push(volumeSeries);
    }
    
    if (mainPanelRef.current) {
      const scrollbar = mainPanelRef.current.get("scrollbarX") as am5xy.XYChartScrollbar;
      if (scrollbar && scrollbar.chart) {
        const sbSeries = scrollbar.chart.series.getIndex(0);
        if (sbSeries) {
          seriesToUpdate.push(sbSeries);
        }
      }
    }
    
    seriesToUpdate.forEach(item => {
      if (item && item.data) {
        item.data.setAll(chartData);
      }
    });
    
    if (shouldFitOnNextLoadRef.current && mainPanelRef.current) {
      mainPanelRef.current.zoomOut();
      shouldFitOnNextLoadRef.current = false;
    }
  }, [data, shouldFitOnNextLoadRef]);

  useEffect(() => {
    if (currentGranularity && intervalSwitcherRef.current) {
      const items = intervalSwitcherRef.current.get("items") || [];
      const matchingItemIndex = items.findIndex((item: any) => item.id === currentGranularity.symbol);
      
      if (matchingItemIndex >= 0) {
        (intervalSwitcherRef.current as any).set("selectedIndex", matchingItemIndex);
      }
    }
  }, [currentGranularity, intervalSwitcherRef]);
};