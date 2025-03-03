import { Granularity } from "../types/Granularity";

export const hasOHLCFormat = (data: any[]): boolean => {
  return data.length > 0 && 
         data[0].open !== undefined && 
         data[0].high !== undefined && 
         data[0].low !== undefined && 
         data[0].close !== undefined;
};

export const transformDataForChart = (data: any[]): any[] => {
  if (!data || data.length === 0) return [];
  
  const isOHLCData = hasOHLCFormat(data);
  const sortedData = [...data].sort((a, b) => a.time - b.time);
  const timeGaps = findLargeTimeGaps(sortedData);
  
  if (timeGaps.length > 0) {
    let result: any[] = [];
    let lastIdx = 0;
    
    timeGaps.forEach(gapIdx => {
      const segment = sortedData.slice(lastIdx, gapIdx + 1);
      result = result.concat(transformSegment(segment, isOHLCData));
      
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
    
    if (lastIdx < sortedData.length) {
      const finalSegment = sortedData.slice(lastIdx);
      result = result.concat(transformSegment(finalSegment, isOHLCData));
    }
    
    return result;
  }
  
  return transformSegment(sortedData, isOHLCData);
};

function transformSegment(data: any[], isOHLCData: boolean): any[] {
  return data.map(item => {
    if (isOHLCData) {
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
}

function findLargeTimeGaps(data: any[]): number[] {
  const gaps: number[] = [];
  const GAP_THRESHOLD = 3600;
  
  for (let i = 0; i < data.length - 1; i++) {
    const timeDiff = data[i + 1].time - data[i].time;
    if (timeDiff > GAP_THRESHOLD) {
      gaps.push(i);
    }
  }
  
  return gaps;
}

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