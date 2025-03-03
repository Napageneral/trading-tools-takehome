import { useState, useRef, useCallback, useEffect } from 'react';
import { LineData, Time } from 'lightweight-charts';
import { API_URL } from '../constants/api';
import { RingBuffer } from '../components/RingBuffer';
import { debounce } from '../utils/debounce';
import { GRANULARITIES, DEFAULT_GRANULARITY, Granularity } from '../types/Granularity';

interface TimeSeriesDataOptions {
  dynamicGranularity?: boolean;
  onVisibleRangeChangeWithGranularity?: (range: { from: number; to: number; visibleRangeNs: number }) => void;
}

export const useTimeSeriesData = (options: TimeSeriesDataOptions = {}) => {
  const { dynamicGranularity = true, onVisibleRangeChangeWithGranularity } = options;  
  const [chartData, setChartData] = useState<LineData<Time>[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentGranularity, setCurrentGranularity] = useState<Granularity>(DEFAULT_GRANULARITY);  
  const [startNs, setStartNs] = useState<string>('');
  const [endNs, setEndNs] = useState<string>('');  
  const wsRef = useRef<WebSocket | null>(null);  
  const ringBufferRef = useRef(new RingBuffer<LineData<Time>>(100000));  
  const dataCache = useRef<Map<string, LineData<Time>[]>>(new Map());  
  const [wsReady, setWsReady] = useState<boolean>(false);
  const pendingMessagesRef = useRef<Array<any>>([]);
  const pendingActionRef = useRef<string | null>(null);
  
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return wsRef.current;
    }

    console.log('Creating new WebSocket connection');
    const ws = new WebSocket(`ws://${API_URL.replace('http://', '')}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setWsReady(true);
      
      if (pendingMessagesRef.current.length > 0) {
        console.log('Sending pending messages:', pendingMessagesRef.current.length);
        pendingMessagesRef.current.forEach(msg => {
          ws.send(JSON.stringify(msg));
        });
        pendingMessagesRef.current = [];
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (Array.isArray(data)) {
          if (data.length === 0) {
            setLoading(false);
            
            if (pendingActionRef.current === 'fit') {
              pendingActionRef.current = null;
              setTimeout(() => {
                if (document.dispatchEvent) {
                  document.dispatchEvent(new CustomEvent('fit-chart-content'));
                }
              }, 50);
            }
            return;
          }
          
          const newChartData = data.map((point: any) => ({
            time: Number(point.timestamp_ns) / 1_000_000_000 as Time,
            value: point.value
          }));

          newChartData.forEach((point: any) => {
            ringBufferRef.current.push(point);
          });

          setChartData(ringBufferRef.current.toArray());
        } else if (data.granularity) {
          const newGran = GRANULARITIES[data.granularity];
          if (newGran) {
            setCurrentGranularity(newGran);
            
            const start = startNs || '0';
            const end = endNs || '0';
            const cacheKey = `${start}_${end}_${data.granularity}`;
            dataCache.current.set(cacheKey, [...ringBufferRef.current.toArray()]);
          }
        } else if (data.error) {
          console.error('Error from server:', data.error);
          setError(data.error);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setWsReady(false);
      
      setTimeout(() => {
        connectWebSocket();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error');
      setLoading(false);
      setWsReady(false);
    };

    return ws;
  }, [startNs, endNs]);

  const sendWsMessage = useCallback((message: any) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not ready, queueing message');
      pendingMessagesRef.current.push(message);
      
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connectWebSocket();
      }
      return;
    }
    
    console.log('Sending WebSocket message:', message);
    wsRef.current.send(JSON.stringify(message));
  }, [connectWebSocket]);

  const loadData = useCallback((startNsValue: number, endNsValue: number, granularity: Granularity) => {
    setLoading(true);
    setError(null);
    
    console.log(`Loading data from ${new Date(startNsValue / 1_000_000).toLocaleString()} to ${new Date(endNsValue / 1_000_000).toLocaleString()} with granularity ${granularity.symbol}`);
    
    setStartNs(startNsValue.toString());
    setEndNs(endNsValue.toString());
    console.log(`[useTimeSeriesData] loadData: Updated time range - startNs: ${startNsValue}, endNs: ${endNsValue}, granularity: ${granularity.symbol}`);
    
    const cacheKey = `${startNsValue}_${endNsValue}_${granularity.symbol}`;
    if (dataCache.current.has(cacheKey)) {
      console.log('Using cached data');
      const cachedData = dataCache.current.get(cacheKey) || [];
      
      ringBufferRef.current.clear();
      
      cachedData.forEach((point: LineData<Time>) => {
        ringBufferRef.current.push(point);
      });
      
      setChartData(ringBufferRef.current.toArray());
      setLoading(false);
      return;
    }
    
    ringBufferRef.current.clear();
    
    sendWsMessage({
      action: 'load',
      start_ns: startNsValue,
      end_ns: endNsValue,
      granularity: granularity.symbol
    });
    
    pendingActionRef.current = 'fit';
  }, [sendWsMessage]);

  const debouncedLoadData = useCallback(
    debounce((start: number, end: number, gran: Granularity) => {
      loadData(start, end, gran);
    }, 300),
    [loadData]
  );

  const setGranularity = useCallback((granularity: Granularity) => {
    if (granularity === currentGranularity) return;
    
    console.log(`Setting granularity to ${granularity.symbol}`);
    setLoading(true);
    
    const startNsValue = startNs ? parseInt(startNs) : 0;
    const endNsValue = endNs ? parseInt(endNs) : 0;
    
    const cacheKey = `${startNsValue}_${endNsValue}_${granularity.symbol}`;
    dataCache.current.delete(cacheKey);
    
    setCurrentGranularity(granularity);
    console.log(`[useTimeSeriesData] setGranularity: Changing granularity to ${granularity.symbol}. Current time range: startNs: ${startNs ? startNs : '0'}, endNs: ${endNs ? endNs : '0'}`);
    
    loadData(startNsValue, endNsValue, granularity);
  }, [currentGranularity, startNs, endNs, loadData]);

  const moveUpGran = useCallback(() => {
    if (!currentGranularity || !currentGranularity.up) {
      console.log('Already at coarsest granularity');
      return;
    }
    
    console.log(`Moving up to ${currentGranularity.up.symbol}`);
    setLoading(true);
    
    sendWsMessage({
      action: 'move_up_gran'
    });
    
  }, [currentGranularity, sendWsMessage]);

  const moveDownGran = useCallback(() => {
    if (!currentGranularity || !currentGranularity.down) {
      console.log('Already at finest granularity');
      return;
    }
    
    console.log(`Moving down to ${currentGranularity.down.symbol}`);
    setLoading(true);
    
    sendWsMessage({
      action: 'move_down_gran'
    });
    
  }, [currentGranularity, sendWsMessage]);

  const panLeft = useCallback((amountNs: number) => {
    if (!startNs || !endNs) return;
    
    console.log(`Panning left by ${amountNs}ns`);
    setLoading(true);
    
    sendWsMessage({
      action: 'pan_left',
      amount_ns: amountNs
    });
    
  }, [sendWsMessage, startNs, endNs]);

  const panRight = useCallback((amountNs: number) => {
    if (!startNs || !endNs) return;
    
    console.log(`Panning right by ${amountNs}ns`);
    setLoading(true);
    
    sendWsMessage({
      action: 'pan_right',
      amount_ns: amountNs
    });
    
  }, [sendWsMessage, startNs, endNs]);

  const handleVisibleRangeChangeWithGranularity = useCallback(({ from, to, visibleRangeNs }: { from: number; to: number; visibleRangeNs: number }) => {
    if (!dynamicGranularity) return;
    
    const fromNs = Math.floor(from * 1_000_000_000);
    const toNs = Math.ceil(to * 1_000_000_000);
    
    setStartNs(fromNs.toString());
    setEndNs(toNs.toString());
    
    if (onVisibleRangeChangeWithGranularity) {
      onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
    }
  }, [dynamicGranularity, onVisibleRangeChangeWithGranularity]);

  const checkDataBoundariesAndFetch = useCallback((from: number, to: number) => {
    const chartDataArray = ringBufferRef.current.toArray();
    if (chartDataArray.length > 0) {
      const firstPoint = chartDataArray[0];
      const lastPoint = chartDataArray[chartDataArray.length - 1];
      const firstTimeSec = Number(firstPoint.time);
      const lastTimeSec = Number(lastPoint.time);
      const firstTimeNs = firstTimeSec * 1_000_000_000;
      const lastTimeNs = lastTimeSec * 1_000_000_000;
      const leftOverflow = Math.max(0, firstTimeNs - from * 1_000_000_000);
      const rightOverflow = Math.max(0, to * 1_000_000_000 - lastTimeNs);
      const currentRange = lastTimeNs - firstTimeNs;
      const leftOverflowPercent = currentRange > 0 ? (leftOverflow / currentRange) * 100 : 0;
      const rightOverflowPercent = currentRange > 0 ? (rightOverflow / currentRange) * 100 : 0;
      
      console.log(`Left overflow: ${leftOverflowPercent.toFixed(2)}%, Right overflow: ${rightOverflowPercent.toFixed(2)}%`);
      console.log(`[useTimeSeriesData] checkDataBoundariesAndFetch: Loaded data boundaries - firstTimeNs: ${firstTimeNs}, lastTimeNs: ${lastTimeNs}`);
      
      if (from * 1_000_000_000 < firstTimeNs && leftOverflowPercent > 10) {
        const newStart = Math.floor(from * 1_000_000_000 - (to - from) * 1_000_000_000 * 0.5);
        const newEnd = lastTimeNs;
        console.log(`Panned left beyond data boundary, fetching more data from ${new Date(newStart / 1_000_000).toLocaleString()}`);
        debouncedLoadData(newStart, newEnd, currentGranularity!);
        return;
      }
      
      if (to * 1_000_000_000 > lastTimeNs && rightOverflowPercent > 10) {
        const newStart = firstTimeNs;
        const newEnd = Math.ceil(to * 1_000_000_000 + (to - from) * 1_000_000_000 * 0.5);
        console.log(`Panned right beyond data boundary, fetching more data to ${new Date(newEnd / 1_000_000).toLocaleString()}`);
        debouncedLoadData(newStart, newEnd, currentGranularity!);
        return;
      }
    } else {
      console.log('No data loaded yet, doing initial fetch');
      loadData(from * 1_000_000_000, to * 1_000_000_000, currentGranularity || DEFAULT_GRANULARITY);
    }
  }, [debouncedLoadData, loadData, currentGranularity]);

  const forceReload = useCallback((visibleRange: { from: number; to: number }, logicalRange?: { from: number; to: number } | null) => {
    if (!visibleRange) return;
    
    const chartDataArray = ringBufferRef.current.toArray();
    if (chartDataArray.length === 0) {
      console.log('No data loaded in chart to calculate expanded range.');
      return;
    }
    
    const firstPoint = chartDataArray[0];
    const lastPoint = chartDataArray[chartDataArray.length - 1];
    const firstTimeSec = Number(firstPoint.time);
    const lastTimeSec = Number(lastPoint.time);
    
    const currentDataRangeSec = lastTimeSec - firstTimeSec;
    
    let expandedStartNs, expandedEndNs;
    
    if (logicalRange && logicalRange.from !== undefined && logicalRange.to !== undefined) {
      console.log('Using logical range for force reload:', logicalRange);
      
      const logicalRangeSize = logicalRange.to - logicalRange.from;
      
      if (logicalRangeSize > 0) {
        const visibleRangeSec = visibleRange.to - visibleRange.from;
        const expansionFactor = Math.max(1.5, visibleRangeSec / currentDataRangeSec);
        
        expandedStartNs = Math.floor((firstTimeSec - (currentDataRangeSec * (expansionFactor - 1) / 2)) * 1_000_000_000);
        expandedEndNs = Math.ceil((lastTimeSec + (currentDataRangeSec * (expansionFactor - 1) / 2)) * 1_000_000_000);
        
        console.log(`Expanding data range by factor: ${expansionFactor.toFixed(2)} based on logical range`);
      } else {
        expandedStartNs = Math.floor(firstTimeSec * 1_000_000_000 - currentDataRangeSec * 0.2 * 1_000_000_000);
        expandedEndNs = Math.ceil(lastTimeSec * 1_000_000_000 + currentDataRangeSec * 0.2 * 1_000_000_000);
      }
    } else {
      expandedStartNs = Math.floor(firstTimeSec * 1_000_000_000 - currentDataRangeSec * 0.2 * 1_000_000_000);
      expandedEndNs = Math.ceil(lastTimeSec * 1_000_000_000 + currentDataRangeSec * 0.2 * 1_000_000_000);
    }
    
    console.log(`Force reloading data from ${new Date(expandedStartNs / 1_000_000).toLocaleString()} to ${new Date(expandedEndNs / 1_000_000).toLocaleString()} with granularity ${currentGranularity.symbol}`);
    
    loadData(expandedStartNs, expandedEndNs, currentGranularity);
  }, [currentGranularity, loadData]);

  const debugCall = useCallback((action: string, params: any) => {
    const startTime = performance.now();
    const listener = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`Response for ${action}:`, data);
      } catch (e) {
        console.error(e);
      }
      const serverResponseTime = performance.now() - startTime;
      console.log(`${action} server response time: ${serverResponseTime.toFixed(2)} ms`);
      wsRef.current?.removeEventListener('message', listener);
    };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.addEventListener('message', listener);
    } else {
      connectWebSocket();
      setTimeout(() => {
        wsRef.current?.addEventListener('message', listener);
      }, 500);
    }
    sendWsMessage({ action, ...params });
  }, [sendWsMessage, connectWebSocket]);

  const debugLoad = useCallback((selectedGran?: Granularity) => {
    const gran = selectedGran || currentGranularity;

    if (selectedGran && selectedGran.symbol !== currentGranularity.symbol) {
        console.log(`Updating granularity state to ${selectedGran.symbol} via debug load`);
        setCurrentGranularity(selectedGran);
    }
    
    const startNsValue = startNs ? parseInt(startNs) : 0;
    const endNsValue = endNs ? parseInt(endNs) : 0;
    
    debugCall('load', {
      start_ns: startNsValue,
      end_ns: endNsValue,
      granularity: gran.symbol
    });
  }, [startNs, endNs, currentGranularity, debugCall]);

  const debugStreamRight = useCallback(() => {
    let startNsValue, endNsValue;
    const shiftNs = Number(currentGranularity.size) * 1e9;
    if (chartData.length > 0) {
      const lastPoint = chartData[chartData.length - 1];
      startNsValue = Math.floor(Number(lastPoint.time) * 1e9);
      endNsValue = startNsValue + shiftNs;
    } else {
      startNsValue = startNs ? parseInt(startNs) : 0;
      endNsValue = startNsValue + shiftNs;
    }
    debugCall('stream_right', {
      start_ns: startNsValue,
      end_ns: endNsValue,
      granularity: currentGranularity.symbol
    });
  }, [chartData, currentGranularity, startNs, debugCall]);

  const debugStreamLeft = useCallback(() => {
    let startNsValue, endNsValue;
    const shiftNs = Number(currentGranularity.size) * 1e9;
    if (chartData.length > 0) {
      const firstPoint = chartData[0];
      endNsValue = Math.floor(Number(firstPoint.time) * 1e9);
      startNsValue = endNsValue - shiftNs;
    } else {
      endNsValue = endNs ? parseInt(endNs) : 0;
      startNsValue = endNsValue - shiftNs;
    }
    debugCall('stream_left', {
      start_ns: startNsValue,
      end_ns: endNsValue,
      granularity: currentGranularity.symbol
    });
  }, [chartData, currentGranularity, endNs, debugCall]);

  useEffect(() => {
    connectWebSocket();
  }, [connectWebSocket]);

  return {
    chartData,
    loading,
    error,
    currentGranularity,
    startNs,
    endNs,
    loadData,
    handleVisibleRangeChangeWithGranularity,
    forceReload,
    setGranularity,
    moveUpGran,
    moveDownGran,
    panLeft,
    panRight,
    setDynamicGranularity: (value: boolean) => {
      options.dynamicGranularity = value;
    },
    debugLoad,
    debugStreamRight,
    debugStreamLeft
  };
};

export default useTimeSeriesData;