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
 * Transforms application data into the format expected by amCharts
 */
export const transformDataForChart = (data: any[]): any[] => {
  if (!data || data.length === 0) return [];
  
  const isOHLCData = hasOHLCFormat(data);
  
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
};

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