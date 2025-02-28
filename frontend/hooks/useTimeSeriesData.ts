import { useState, useRef, useCallback, useEffect } from 'react';
import { LineData, Time } from 'lightweight-charts';
import { API_URL } from '../constants/api';
import { RingBuffer } from '../components/RingBuffer';
import { debounce } from '../utils/debounce';
import { pickGranularityWithHysteresis, getNextCoarserGranularity, computeCoverage } from '../utils/granularityUtils';

interface TimeSeriesDataOptions {
  dynamicGranularity?: boolean;
}

export const useTimeSeriesData = (options: TimeSeriesDataOptions = {}) => {
  const { dynamicGranularity = true } = options;
  
  // State for data
  const [chartData, setChartData] = useState<LineData<Time>[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentGranularity, setCurrentGranularity] = useState<string | null>(null);
  
  // State for time range (for display purposes)
  const [startNs, setStartNs] = useState<string>('');
  const [endNs, setEndNs] = useState<string>('');
  
  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);
  
  // Ring buffer for efficient data handling
  const ringBufferRef = useRef(new RingBuffer<LineData<Time>>(100000));
  
  // Cache for fetched data to avoid redundant requests
  const dataCache = useRef<Map<string, LineData<Time>[]>>(new Map());
  
  // Store the last fetch request to prevent duplicate requests
  const lastFetchRef = useRef<{start: number, end: number, granularity: string | null} | null>(null);
  
  // Skip coarser granularity auto-fetch
  const skipCoarserRef = useRef(false);
  
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
          
          // Convert to format expected by lightweight-charts, explicitly casting time to a number
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
  const fetchDataHttp = useCallback(async (startNsValue: number, endNsValue: number, granularity: string) => {
    // Check if this is a duplicate request
    if (lastFetchRef.current && 
        lastFetchRef.current.start === startNsValue && 
        lastFetchRef.current.end === endNsValue && 
        lastFetchRef.current.granularity === granularity) {
      console.log('Skipping duplicate fetch request');
      return;
    }
    
    // Store this request
    lastFetchRef.current = { start: startNsValue, end: endNsValue, granularity: granularity };
    
    setLoading(true);
    setError(null);
    
    console.log(`Fetching data from ${new Date(startNsValue / 1_000_000).toLocaleString()} to ${new Date(endNsValue / 1_000_000).toLocaleString()} with granularity ${granularity || 'raw'}`);
    
    try {
      // Check cache first
      const cacheKey = `${startNsValue}_${endNsValue}_${granularity}`;
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
      
      // Build URL
      const url = new URL(`${API_URL}/data`);
      url.searchParams.append('start_ns', startNsValue.toString());
      url.searchParams.append('end_ns', endNsValue.toString());
      if (granularity) {
        url.searchParams.append('granularity', granularity);
      }
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      
      const result = await response.json();
      
      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      
      // Map the raw data to chart data format
      const chartData = result.data.map((point: any) => ({
        time: Number(point.timestamp_ns) / 1_000_000_000 as Time,
        value: point.value
      }));
      
      // Set the chart data with proper type casting
      setChartData(chartData as LineData<Time>[]);
      
      // Perform coverage check using the helper function
      const coverageRatio = computeCoverage(chartData, startNsValue, endNsValue);
      if (coverageRatio < 0.8 && !skipCoarserRef.current) {
        const nextGran = getNextCoarserGranularity(result.granularity);
        if (nextGran) {
          console.log(`Coverage only ${(coverageRatio*100).toFixed(1)}%. Trying coarser granularity: ${nextGran}.`);
          skipCoarserRef.current = true; // avoid infinite loop
          fetchDataHttp(startNsValue, endNsValue, nextGran);
          return;
        }
      }
      
      // Reset the skip flag for next fetch
      skipCoarserRef.current = false;
      
      // Update current granularity
      setCurrentGranularity(result.granularity);
      
      // Cache the data
      dataCache.current.set(cacheKey, [...chartData]);
      if (result.granularity !== granularity) {
        const actualCacheKey = `${startNsValue}_${endNsValue}_${result.granularity}`;
        dataCache.current.set(actualCacheKey, [...chartData]);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [API_URL, dataCache, lastFetchRef, ringBufferRef]);

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
    
    console.log(`Visible range changed: ${new Date(fromNs / 1_000_000).toLocaleString()} to ${new Date(toNs / 1_000_000).toLocaleString()}`);
    console.log(`Visible range in ns: ${visibleRangeNs}, Current granularity: ${currentGranularity}, New granularity: ${newGranularity}`);
    
    // Calculate zoom factor by comparing the visible range with the currently loaded data range
    const chartDataArray = ringBufferRef.current.toArray();
    let zoomFactor = 1.0;
    if (chartDataArray.length > 0) {
      const firstPoint = chartDataArray[0];
      const lastPoint = chartDataArray[chartDataArray.length - 1];
      const firstTimeSec = Number(firstPoint.time);
      const lastTimeSec = Number(lastPoint.time);
      const firstTimeNs = firstTimeSec * 1_000_000_000;
      const lastTimeNs = lastTimeSec * 1_000_000_000;
      const currentDataRange = lastTimeNs - firstTimeNs;
      const visibleRangeDuration = toNs - fromNs;
      if (currentDataRange > 0) {
        zoomFactor = visibleRangeDuration / currentDataRange;
      }
      // Compute overflows
      const leftOverflow = Math.max(0, firstTimeNs - fromNs);
      const rightOverflow = Math.max(0, toNs - lastTimeNs);
      const leftOverflowPercent = currentDataRange > 0 ? (leftOverflow / currentDataRange) * 100 : 0;
      const rightOverflowPercent = currentDataRange > 0 ? (rightOverflow / currentDataRange) * 100 : 0;
      
      console.log(`Current data range: ${new Date(firstTimeNs / 1_000_000).toLocaleString()} to ${new Date(lastTimeNs / 1_000_000).toLocaleString()}`);
      console.log(`Zoom factor: ${zoomFactor.toFixed(2)}`);
      console.log(`Left overflow: ${leftOverflowPercent.toFixed(2)}%, Right overflow: ${rightOverflowPercent.toFixed(2)}%`);
      
      if (zoomFactor === 1.0) {
        console.log('Chart appears fully loaded; visible range exactly matches loaded data range.');
      }
    } else {
      console.log('No data loaded in chart to calculate zoom factor.');
    }

    // CASE 1: Granularity changed - always fetch new data
    if (newGranularity !== currentGranularity) {
      console.log(`Granularity changed from ${currentGranularity} to ${newGranularity} - fetching new data`);
      const expandedFromNs = Math.floor(fromNs - (toNs - fromNs) * 0.1);
      const expandedToNs = Math.ceil(toNs + (toNs - fromNs) * 0.1);
      debouncedFetchData(expandedFromNs, expandedToNs, newGranularity);
      return;
    }

    // CASE 2: Check if we've panned or zoomed beyond our current data range
    if (chartDataArray.length > 0) {
      const firstPoint = chartDataArray[0];
      const lastPoint = chartDataArray[chartDataArray.length - 1];
      const firstTimeSec = Number(firstPoint.time);
      const lastTimeSec = Number(lastPoint.time);
      const firstTimeNs = firstTimeSec * 1_000_000_000;
      const lastTimeNs = lastTimeSec * 1_000_000_000;
      const leftOverflow = Math.max(0, firstTimeNs - fromNs);
      const rightOverflow = Math.max(0, toNs - lastTimeNs);
      const currentRange = lastTimeNs - firstTimeNs;
      const leftOverflowPercent = currentRange > 0 ? (leftOverflow / currentRange) * 100 : 0;
      const rightOverflowPercent = currentRange > 0 ? (rightOverflow / currentRange) * 100 : 0;
      
      console.log(`Left overflow: ${leftOverflowPercent.toFixed(2)}%, Right overflow: ${rightOverflowPercent.toFixed(2)}%`);
      
      const significantZoomOut = leftOverflowPercent > 20 || rightOverflowPercent > 20;
      const outsideDataRange = fromNs < firstTimeNs || toNs > lastTimeNs;
      
      if (significantZoomOut || outsideDataRange || zoomFactor > 1.5) {
        console.log('Significant zoom out or view outside current data range - fetching new data');
        const expandedFromNs = Math.floor(fromNs - (toNs - fromNs) * 0.1);
        const expandedToNs = Math.ceil(toNs + (toNs - fromNs) * 0.1);
        debouncedFetchData(expandedFromNs, expandedToNs, newGranularity);
        return;
      }
    } else {
      console.log('No data in chart, fetching initial data');
      debouncedFetchData(fromNs, toNs, newGranularity);
    }
  }, [dynamicGranularity, currentGranularity, debouncedFetchData]);

  // Update the forceReload function to use logical range for determining the full time range
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
    
    // Calculate visible range in nanoseconds for granularity selection
    const expandedRangeNs = expandedEndNs - expandedStartNs;
    
    // Calculate appropriate granularity for this range
    const newGranularity = pickGranularityWithHysteresis(expandedRangeNs, currentGranularity);
    
    console.log(`Force reloading data from ${new Date(expandedStartNs / 1_000_000).toLocaleString()} to ${new Date(expandedEndNs / 1_000_000).toLocaleString()} with granularity ${newGranularity}`);
    
    // Reset the duplicate request guard
    lastFetchRef.current = null;
    
    // Fetch data with the expanded range and calculated granularity
    setLoading(true);
    fetchDataHttp(expandedStartNs, expandedEndNs, newGranularity);
  }, [currentGranularity, fetchDataHttp]);

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
    forceReload,
    setDynamicGranularity: (value: boolean) => {
      // We're not using a state setter here because this is a controlled option from outside
      options.dynamicGranularity = value;
    }
  };
};

export default useTimeSeriesData; 