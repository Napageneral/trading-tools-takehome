/**
 * Utility functions for transforming data for amCharts
 */
import { Granularity } from "../types/Granularity";

/**
 * Determines if data has OHLC (Open-High-Low-Close) format
 */
export const hasOHLCFormat = (data: any[]): boolean => {
  return data.length > 0 && 
         data[0].open !== undefined && 
         data[0].high !== undefined && 
         data[0].low !== undefined && 
         data[0].close !== undefined;
};

/**
 * Transforms application data into the format expected by amCharts,
 * with special handling to prevent unwanted straight lines
 */
export const transformDataForChart = (data: any[]): any[] => {
  if (!data || data.length === 0) return [];
  
  const isOHLCData = hasOHLCFormat(data);

  // Sort the data by time to ensure proper sequence
  const sortedData = [...data].sort((a, b) => a.time - b.time);
  
  // Find any large gaps in the data where straight lines might be drawn
  const timeGaps = findLargeTimeGaps(sortedData);
  
  // If there are large gaps, we'll split the data into multiple segments
  if (timeGaps.length > 0) {
    // Create separate data segments with "break" points where the line shouldn't connect
    let result: any[] = [];
    let lastIdx = 0;
    
    // Add each segment with a gap marker
    timeGaps.forEach(gapIdx => {
      // Add the current segment up to the gap
      const segment = sortedData.slice(lastIdx, gapIdx + 1);
      result = result.concat(transformSegment(segment, isOHLCData));
      
      // Add a "break" marker (null value) to prevent connecting across the gap
      if (isOHLCData) {
        result.push({
          time: new Date((sortedData[gapIdx].time + 1) * 1000).getTime(),
          open: null,
          high: null,
          low: null,
          close: null,
          volume: 0
        });
      } else {
        result.push({
          time: new Date((sortedData[gapIdx].time + 1) * 1000).getTime(),
          value: null
        });
      }
      
      lastIdx = gapIdx + 1;
    });
    
    // Add the final segment
    if (lastIdx < sortedData.length) {
      const finalSegment = sortedData.slice(lastIdx);
      result = result.concat(transformSegment(finalSegment, isOHLCData));
    }
    
    return result;
  }
  
  // If no large gaps, just transform normally
  return transformSegment(sortedData, isOHLCData);
};

/**
 * Transforms a single segment of data
 */
function transformSegment(data: any[], isOHLCData: boolean): any[] {
  return data.map(item => {
    if (isOHLCData) {
      return {
        time: new Date(item.time * 1000).getTime(), // Convert seconds to milliseconds
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume || 0
      };
    } else {
      return {
        time: new Date(item.time * 1000).getTime(), // Convert seconds to milliseconds
        value: item.value
      };
    }
  });
}

/**
 * Find indices where there are large time gaps in the data
 */
function findLargeTimeGaps(data: any[]): number[] {
  const gaps: number[] = [];
  const GAP_THRESHOLD = 3600; // 1 hour in seconds - adjust as needed
  
  for (let i = 0; i < data.length - 1; i++) {
    const timeDiff = data[i + 1].time - data[i].time;
    if (timeDiff > GAP_THRESHOLD) {
      gaps.push(i);
    }
  }
  
  return gaps;
}

/**
 * Calculates the number of visible data points within a time range
 */
export const calculateVisibleTickCount = (data: any[], from: number, to: number): number => {
  if (!data || data.length === 0) return 0;
  
  let count = 0;
  
  for (const point of data) {
    const pointTime = typeof point.time === 'number' ? point.time : Number(point.time);
    if (pointTime >= from && pointTime <= to) {
      count++;
    }
  }
  
  return count;
}; 