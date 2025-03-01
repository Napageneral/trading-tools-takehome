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
  
  // State for data
  const [chartData, setChartData] = useState<LineData<Time>[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentGranularity, setCurrentGranularity] = useState<Granularity>(DEFAULT_GRANULARITY);
  
  // State for time range (for display purposes)
  const [startNs, setStartNs] = useState<string>('');
  const [endNs, setEndNs] = useState<string>('');
  
  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);
  
  // Ring buffer for efficient data handling
  const ringBufferRef = useRef(new RingBuffer<LineData<Time>>(100000));
  
  // Cache for fetched data to avoid redundant requests
  const dataCache = useRef<Map<string, LineData<Time>[]>>(new Map());
  
  // Track if the socket is ready
  const [wsReady, setWsReady] = useState<boolean>(false);
  
  // Store pending messages to send when socket is ready
  const pendingMessagesRef = useRef<Array<any>>([]);
  
  // Pending action to execute once data is received
  const pendingActionRef = useRef<string | null>(null);
  
  // Track the last time we changed granularity to add hysteresis - moved to top level
  const lastGranChangeTimeRef = useRef<number>(0);
  const GRANULARITY_CHANGE_COOLDOWN_MS = 1000; // 1 second cooldown
  
  // Connect to WebSocket - now it's a persistent connection
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
      
      // Send any pending messages
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
            // Empty chunk signals end of data
            setLoading(false);
            
            // Execute pending action if any
            if (pendingActionRef.current === 'fit') {
              pendingActionRef.current = null;
              // We need to wait for the chart to render before fitting
              setTimeout(() => {
                if (document.dispatchEvent) {
                  document.dispatchEvent(new CustomEvent('fit-chart-content'));
                }
              }, 50);
            }
            return;
          }
          
          // Convert to format expected by lightweight-charts
          const newChartData = data.map((point: any) => ({
            time: Number(point.timestamp_ns) / 1_000_000_000 as Time,
            value: point.value
          }));

          // Add to ring buffer
          newChartData.forEach((point: any) => {
            ringBufferRef.current.push(point);
          });

          // Update chart with all data in ring buffer
          setChartData(ringBufferRef.current.toArray());
        } else if (data.granularity) {
          // Update current granularity
          const newGran = GRANULARITIES[data.granularity];
          if (newGran) {
            setCurrentGranularity(newGran);
            
            // Cache the data with current time range
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
      
      // Try to reconnect after a delay
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

  // Send message through WebSocket
  const sendWsMessage = useCallback((message: any) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not ready, queueing message');
      pendingMessagesRef.current.push(message);
      
      // Try to connect if not already connecting
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connectWebSocket();
      }
      return;
    }
    
    console.log('Sending WebSocket message:', message);
    wsRef.current.send(JSON.stringify(message));
  }, [connectWebSocket]);

  // Load data through WebSocket
  const loadData = useCallback((startNsValue: number, endNsValue: number, granularity: Granularity) => {
    setLoading(true);
    setError(null);
    
    console.log(`Loading data from ${new Date(startNsValue / 1_000_000).toLocaleString()} to ${new Date(endNsValue / 1_000_000).toLocaleString()} with granularity ${granularity.symbol}`);
    
    // Update displayed time range
    setStartNs(startNsValue.toString());
    setEndNs(endNsValue.toString());
    
    // Check cache first
    const cacheKey = `${startNsValue}_${endNsValue}_${granularity.symbol}`;
    if (dataCache.current.has(cacheKey)) {
      console.log('Using cached data');
      const cachedData = dataCache.current.get(cacheKey) || [];
      
      // Clear previous data
      ringBufferRef.current.clear();
      
      // Add cached data to ring buffer
      cachedData.forEach((point: LineData<Time>) => {
        ringBufferRef.current.push(point);
      });
      
      setChartData(ringBufferRef.current.toArray());
      setLoading(false);
      return;
    }
    
    // Clear the ring buffer for new data
    ringBufferRef.current.clear();
    
    // Send request via WebSocket
    sendWsMessage({
      action: 'load',
      start_ns: startNsValue,
      end_ns: endNsValue,
      granularity: granularity.symbol
    });
    
    // Mark that we want to fit content when data is loaded
    pendingActionRef.current = 'fit';
  }, [sendWsMessage]);

  // Debounced version of loadData
  const debouncedLoadData = useCallback(
    debounce((start: number, end: number, gran: Granularity) => {
      loadData(start, end, gran);
    }, 300),
    [loadData]
  );

  // Set granularity explicitly
  const setGranularity = useCallback((granularity: Granularity) => {
    if (granularity === currentGranularity) return;
    
    console.log(`Setting granularity to ${granularity.symbol}`);
    setLoading(true);
    
    // Parse the current time range from state
    const startNsValue = startNs ? parseInt(startNs) : 0;
    const endNsValue = endNs ? parseInt(endNs) : 0;
    
    // Clear the cache for this time range with the new granularity so that a fresh fetch is forced
    const cacheKey = `${startNsValue}_${endNsValue}_${granularity.symbol}`;
    dataCache.current.delete(cacheKey);
    
    // Update the current granularity state
    setCurrentGranularity(granularity);
    
    // Trigger loading new data for the current time range with the new granularity
    loadData(startNsValue, endNsValue, granularity);
  }, [currentGranularity, startNs, endNs, loadData]);

  // Move to coarser granularity
  const moveUpGran = useCallback(() => {
    if (!currentGranularity || !currentGranularity.up) {
      console.log('Already at coarsest granularity');
      return;
    }
    
    console.log(`Moving up to ${currentGranularity.up.symbol}`);
    setLoading(true);
    
    // Send move_up_gran via WebSocket
    sendWsMessage({
      action: 'move_up_gran'
    });
    
    // We'll update the state when we receive confirmation
  }, [currentGranularity, sendWsMessage]);

  // Move to finer granularity
  const moveDownGran = useCallback(() => {
    if (!currentGranularity || !currentGranularity.down) {
      console.log('Already at finest granularity');
      return;
    }
    
    console.log(`Moving down to ${currentGranularity.down.symbol}`);
    setLoading(true);
    
    // Send move_down_gran via WebSocket
    sendWsMessage({
      action: 'move_down_gran'
    });
    
    // We'll update the state when we receive confirmation
  }, [currentGranularity, sendWsMessage]);

  // Pan left (backwards in time)
  const panLeft = useCallback((amountNs: number) => {
    if (!startNs || !endNs) return;
    
    console.log(`Panning left by ${amountNs}ns`);
    setLoading(true);
    
    // Send pan_left via WebSocket
    sendWsMessage({
      action: 'pan_left',
      amount_ns: amountNs
    });
    
    // We'll update state when we receive data
  }, [sendWsMessage, startNs, endNs]);

  // Pan right (forwards in time)
  const panRight = useCallback((amountNs: number) => {
    if (!startNs || !endNs) return;
    
    console.log(`Panning right by ${amountNs}ns`);
    setLoading(true);
    
    // Send pan_right via WebSocket
    sendWsMessage({
      action: 'pan_right',
      amount_ns: amountNs
    });
    
    // We'll update state when we receive data
  }, [sendWsMessage, startNs, endNs]);

  // Handle chart visible range change with granularity
  const handleVisibleRangeChangeWithGranularity = useCallback(({ from, to, visibleRangeNs }: { from: number; to: number; visibleRangeNs: number }) => {
    if (!dynamicGranularity) return;
    
    // Convert seconds back to nanoseconds
    const fromNs = Math.floor(from * 1_000_000_000);
    const toNs = Math.ceil(to * 1_000_000_000);
    
    // Update time range for display
    setStartNs(fromNs.toString());
    setEndNs(toNs.toString());
    
    // Simply trigger the callback with the visible range, no auto gran switching
    if (onVisibleRangeChangeWithGranularity) {
      onVisibleRangeChangeWithGranularity({ from, to, visibleRangeNs });
    }
  }, [dynamicGranularity, onVisibleRangeChangeWithGranularity]);

  // Extract the boundary checking into a separate function for clarity
  const checkDataBoundariesAndFetch = useCallback((from: number, to: number) => {
    // Check if we need to fetch more data due to panning
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
      
      // If we've panned significantly outside our current data range, fetch more data
      if (from * 1_000_000_000 < firstTimeNs && leftOverflowPercent > 10) {
        // We've panned too far left, load more data to the left
        const newStart = Math.floor(from * 1_000_000_000 - (to - from) * 1_000_000_000 * 0.5);
        const newEnd = lastTimeNs;
        console.log(`Panned left beyond data boundary, fetching more data from ${new Date(newStart / 1_000_000).toLocaleString()}`);
        debouncedLoadData(newStart, newEnd, currentGranularity!);
        return;
      }
      
      if (to * 1_000_000_000 > lastTimeNs && rightOverflowPercent > 10) {
        // We've panned too far right, load more data to the right
        const newStart = firstTimeNs;
        const newEnd = Math.ceil(to * 1_000_000_000 + (to - from) * 1_000_000_000 * 0.5);
        console.log(`Panned right beyond data boundary, fetching more data to ${new Date(newEnd / 1_000_000).toLocaleString()}`);
        debouncedLoadData(newStart, newEnd, currentGranularity!);
        return;
      }
    } else {
      // No data loaded yet, do initial fetch with appropriate granularity
      console.log('No data loaded yet, doing initial fetch');
      loadData(from * 1_000_000_000, to * 1_000_000_000, currentGranularity || DEFAULT_GRANULARITY);
    }
  }, [debouncedLoadData, loadData, currentGranularity]);

  // Force reload with expanded range
  const forceReload = useCallback((visibleRange: { from: number; to: number }, logicalRange?: { from: number; to: number } | null) => {
    if (!visibleRange) return;
    
    // Get the current data range from the chart data
    const chartDataArray = ringBufferRef.current.toArray();
    if (chartDataArray.length === 0) {
      console.log('No data loaded in chart to calculate expanded range.');
      return;
    }
    
    // Get the first and last data points to determine the current data range
    const firstPoint = chartDataArray[0];
    const lastPoint = chartDataArray[chartDataArray.length - 1];
    const firstTimeSec = Number(firstPoint.time);
    const lastTimeSec = Number(lastPoint.time);
    
    // Calculate the current data range in seconds
    const currentDataRangeSec = lastTimeSec - firstTimeSec;
    
    // If we have a logical range, use it to determine how much to expand beyond the current data
    let expandedStartNs, expandedEndNs;
    
    if (logicalRange && logicalRange.from !== undefined && logicalRange.to !== undefined) {
      console.log('Using logical range for force reload:', logicalRange);
      
      // Calculate how much the logical range extends beyond the visible range
      // The logical range is normalized [0, 1], so we need to extrapolate
      const logicalRangeSize = logicalRange.to - logicalRange.from;
      
      // If logical range is valid, use it to calculate the expanded range
      if (logicalRangeSize > 0) {
        // Calculate how much to expand based on the logical range
        // If the logical range is smaller than the visible range, the user has zoomed out
        const visibleRangeSec = visibleRange.to - visibleRange.from;
        const expansionFactor = Math.max(1.5, visibleRangeSec / currentDataRangeSec);
        
        // Expand by the calculated factor, with a minimum of 50% expansion
        expandedStartNs = Math.floor((firstTimeSec - (currentDataRangeSec * (expansionFactor - 1) / 2)) * 1_000_000_000);
        expandedEndNs = Math.ceil((lastTimeSec + (currentDataRangeSec * (expansionFactor - 1) / 2)) * 1_000_000_000);
        
        console.log(`Expanding data range by factor: ${expansionFactor.toFixed(2)} based on logical range`);
      } else {
        // Fallback to standard 20% expansion if logical range is invalid
        expandedStartNs = Math.floor(firstTimeSec * 1_000_000_000 - currentDataRangeSec * 0.2 * 1_000_000_000);
        expandedEndNs = Math.ceil(lastTimeSec * 1_000_000_000 + currentDataRangeSec * 0.2 * 1_000_000_000);
      }
    } else {
      // Fallback to standard 20% expansion if no logical range is provided
      expandedStartNs = Math.floor(firstTimeSec * 1_000_000_000 - currentDataRangeSec * 0.2 * 1_000_000_000);
      expandedEndNs = Math.ceil(lastTimeSec * 1_000_000_000 + currentDataRangeSec * 0.2 * 1_000_000_000);
    }
    
    console.log(`Force reloading data from ${new Date(expandedStartNs / 1_000_000).toLocaleString()} to ${new Date(expandedEndNs / 1_000_000).toLocaleString()} with granularity ${currentGranularity.symbol}`);
    
    // Fetch data with the expanded range and current granularity
    loadData(expandedStartNs, expandedEndNs, currentGranularity);
  }, [currentGranularity, loadData]);

  // Initialize WebSocket on component mount
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
      // We're not using a state setter here because this is a controlled option from outside
      options.dynamicGranularity = value;
    }
  };
};

export default useTimeSeriesData; 