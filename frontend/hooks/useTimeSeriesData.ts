import { useState, useRef, useCallback, useEffect } from 'react';
import { LineData } from 'lightweight-charts';
import { API_URL } from '../constants/api';
import { RingBuffer } from '../components/RingBuffer';
import { debounce } from '../utils/debounce';
import { pickGranularityWithHysteresis } from '../utils/granularityUtils';

interface TimeSeriesDataOptions {
  dynamicGranularity?: boolean;
}

export const useTimeSeriesData = (options: TimeSeriesDataOptions = {}) => {
  const { dynamicGranularity = true } = options;
  
  // State for data
  const [chartData, setChartData] = useState<LineData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentGranularity, setCurrentGranularity] = useState<string | null>(null);
  
  // State for time range (for display purposes)
  const [startNs, setStartNs] = useState<string>('');
  const [endNs, setEndNs] = useState<string>('');
  
  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);
  
  // Ring buffer for efficient data handling
  const ringBufferRef = useRef(new RingBuffer<LineData>(100000));
  
  // Cache for fetched data to avoid redundant requests
  const dataCache = useRef<Map<string, LineData[]>>(new Map());
  
  // Store the last fetch request to prevent duplicate requests
  const lastFetchRef = useRef<{start: number, end: number, granularity: string | null} | null>(null);
  
  // Connect to WebSocket
  const connectWebSocket = useCallback((start: number, end: number, gran: string | null) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`ws://${API_URL.replace('http://', '')}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      // Send initial request
      ws.send(JSON.stringify({
        start_ns: start,
        end_ns: end,
        granularity: gran
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (Array.isArray(data)) {
          if (data.length === 0) {
            // Empty chunk signals end of data
            setLoading(false);
            return;
          }
          
          // Convert to format expected by lightweight-charts
          const newChartData = data.map((point: any) => ({
            time: point.timestamp_ns / 1_000_000_000, // Convert ns to seconds for chart
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
          setCurrentGranularity(data.granularity);
          
          // Cache the data
          const cacheKey = `${start}_${end}_${data.granularity}`;
          dataCache.current.set(cacheKey, [...ringBufferRef.current.toArray()]);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error');
      setLoading(false);
    };

    return ws;
  }, []);

  // Fetch data using HTTP
  const fetchDataHttp = useCallback(async (start: number, end: number, gran: string | null) => {
    // Check if this is a duplicate request
    if (lastFetchRef.current && 
        lastFetchRef.current.start === start && 
        lastFetchRef.current.end === end && 
        lastFetchRef.current.granularity === gran) {
      console.log('Skipping duplicate fetch request');
      return;
    }
    
    // Store this request
    lastFetchRef.current = { start, end, granularity: gran };
    
    setLoading(true);
    setError(null);
    
    console.log(`Fetching data from ${new Date(start / 1_000_000).toLocaleString()} to ${new Date(end / 1_000_000).toLocaleString()} with granularity ${gran || 'raw'}`);
    
    try {
      // Check cache first
      const cacheKey = `${start}_${end}_${gran}`;
      if (dataCache.current.has(cacheKey)) {
        console.log('Using cached data');
        const cachedData = dataCache.current.get(cacheKey) || [];
        
        // Clear previous data
        ringBufferRef.current.clear();
        
        // Add cached data to ring buffer
        cachedData.forEach((point: LineData) => {
          ringBufferRef.current.push(point);
        });
        
        setChartData([...cachedData]);
        setLoading(false);
        return;
      }
      
      // Build URL
      const url = new URL(`${API_URL}/data`);
      url.searchParams.append('start_ns', start.toString());
      url.searchParams.append('end_ns', end.toString());
      if (gran) {
        url.searchParams.append('granularity', gran);
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      
      const result = await response.json();
      
      // Clear previous data
      ringBufferRef.current.clear();
      
      // Convert to chart format
      const newData = result.data.map((point: any) => ({
        time: point.timestamp_ns / 1_000_000_000, // Convert ns to seconds for chart
        value: point.value
      }));
      
      console.log(`Received ${newData.length} data points with granularity ${result.granularity}`);
      
      // Add to ring buffer
      newData.forEach((point: any) => {
        ringBufferRef.current.push(point);
      });
      
      // Update chart data
      const chartDataArray = ringBufferRef.current.toArray();
      setChartData(chartDataArray);
      
      // Update current granularity
      setCurrentGranularity(result.granularity);
      
      // Cache the data
      dataCache.current.set(cacheKey, [...chartDataArray]);
      
      // If we got a different granularity than requested, also cache under that key
      if (result.granularity !== gran) {
        const actualCacheKey = `${start}_${end}_${result.granularity}`;
        dataCache.current.set(actualCacheKey, [...chartDataArray]);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Create a debounced version of fetchDataHttp
  const debouncedFetchData = useCallback(
    debounce((start: number, end: number, gran: string) => {
      fetchDataHttp(start, end, gran);
    }, 300),
    [fetchDataHttp]
  );

  // Handle chart visible range change with granularity
  const handleVisibleRangeChangeWithGranularity = useCallback(({ from, to, visibleRangeNs }: { from: number; to: number; visibleRangeNs: number }) => {
    if (!dynamicGranularity) return;
    
    // Convert seconds back to nanoseconds
    const fromNs = Math.floor(from * 1_000_000_000);
    const toNs = Math.ceil(to * 1_000_000_000);
    
    // Update time range for display
    setStartNs(fromNs.toString());
    setEndNs(toNs.toString());
    
    // Pick appropriate granularity with hysteresis to avoid jitter
    const newGranularity = pickGranularityWithHysteresis(visibleRangeNs, currentGranularity);
    
    // Log for debugging
    console.log(`Visible range changed: ${new Date(fromNs / 1_000_000).toLocaleString()} to ${new Date(toNs / 1_000_000).toLocaleString()}`);
    console.log(`Visible range in ns: ${visibleRangeNs}, Current granularity: ${currentGranularity}, New granularity: ${newGranularity}`);
    
    // Calculate zoom factor - useful to detect significant zoom changes
    const chartDataArray = ringBufferRef.current.toArray();
    let zoomFactor = 1.0;
    
    if (chartDataArray.length > 0) {
      const firstPoint = chartDataArray[0];
      const lastPoint = chartDataArray[chartDataArray.length - 1];
      
      const firstTimeSec = firstPoint.time as number;
      const lastTimeSec = lastPoint.time as number;
      
      const firstTimeNs = firstTimeSec * 1_000_000_000;
      const lastTimeNs = lastTimeSec * 1_000_000_000;
      
      const currentDataRange = lastTimeNs - firstTimeNs;
      const visibleRange = toNs - fromNs;
      
      if (currentDataRange > 0) {
        zoomFactor = visibleRange / currentDataRange;
      }
      
      console.log(`Current data range: ${new Date(firstTimeNs / 1_000_000).toLocaleString()} to ${new Date(lastTimeNs / 1_000_000).toLocaleString()}`);
      console.log(`Zoom factor: ${zoomFactor.toFixed(2)}`);
    }
    
    // CASE 1: Granularity changed - always fetch new data
    if (newGranularity !== currentGranularity) {
      console.log(`Granularity changed from ${currentGranularity} to ${newGranularity} - fetching new data`);
      
      // Use slightly expanded range to avoid frequent refetching at edges
      const expandedFromNs = Math.floor(fromNs - (toNs - fromNs) * 0.1);
      const expandedToNs = Math.ceil(toNs + (toNs - fromNs) * 0.1);
      
      debouncedFetchData(expandedFromNs, expandedToNs, newGranularity);
      return;
    }
    
    // CASE 2: Check if we've panned or zoomed beyond our current data range
    if (chartDataArray.length > 0) {
      const firstPoint = chartDataArray[0];
      const lastPoint = chartDataArray[chartDataArray.length - 1];
      
      const firstTimeSec = firstPoint.time as number;
      const lastTimeSec = lastPoint.time as number;
      
      const firstTimeNs = firstTimeSec * 1_000_000_000;
      const lastTimeNs = lastTimeSec * 1_000_000_000;
      
      // Calculate how much we've zoomed out beyond our current data
      const leftOverflow = Math.max(0, firstTimeNs - fromNs);
      const rightOverflow = Math.max(0, toNs - lastTimeNs);
      
      // Calculate what percentage of the current data range the overflow represents
      const currentRange = lastTimeNs - firstTimeNs;
      const leftOverflowPercent = currentRange > 0 ? (leftOverflow / currentRange) * 100 : 0;
      const rightOverflowPercent = currentRange > 0 ? (rightOverflow / currentRange) * 100 : 0;
      
      console.log(`Left overflow: ${leftOverflowPercent.toFixed(2)}%, Right overflow: ${rightOverflowPercent.toFixed(2)}%`);
      
      // CASE 2A: Significant zoom out (> 20% overflow on either side) or outside current data range
      const significantZoomOut = leftOverflowPercent > 20 || rightOverflowPercent > 20;
      const outsideDataRange = fromNs < firstTimeNs || toNs > lastTimeNs;
      
      if (significantZoomOut || outsideDataRange || zoomFactor > 1.5) {
        console.log('Significant zoom out or view outside current data range - fetching new data');
        
        // Use expanded range to avoid frequent refetching
        const expandedFromNs = Math.floor(fromNs - (toNs - fromNs) * 0.1);
        const expandedToNs = Math.ceil(toNs + (toNs - fromNs) * 0.1);
        
        debouncedFetchData(expandedFromNs, expandedToNs, newGranularity);
      }
    } else {
      // CASE 3: No data in chart - fetch initial data
      console.log('No data in chart, fetching initial data');
      debouncedFetchData(fromNs, toNs, newGranularity);
    }
  }, [dynamicGranularity, currentGranularity, debouncedFetchData]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    chartData,
    loading,
    error,
    currentGranularity,
    startNs,
    endNs,
    fetchDataHttp,
    handleVisibleRangeChangeWithGranularity,
    setDynamicGranularity: (value: boolean) => {
      // We're not using a state setter here because this is a controlled option from outside
      options.dynamicGranularity = value;
    }
  };
};

export default useTimeSeriesData; 