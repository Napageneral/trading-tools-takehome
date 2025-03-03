import React, { useState, useEffect, MutableRefObject, useCallback, useRef } from 'react';
import Chart, { ChartHandle } from './Chart';
import { Granularity } from '../types/Granularity';

interface TimeSeriesDisplayProps {
  data: any[];
  loading: boolean;
  error: string | null;
  currentGranularity: Granularity | null;
  startNs: string;
  endNs: string;
  onVisibleRangeChangeWithGranularity: (params: { from: number; to: number; visibleRangeNs: number }) => void;
  onGranularityChange: (granularity: Granularity) => void;
  chartRef: MutableRefObject<ChartHandle | null>;
}

const TimeSeriesDisplay: React.FC<TimeSeriesDisplayProps> = ({
  data,
  loading,
  error,
  currentGranularity,
  startNs,
  endNs,
  onVisibleRangeChangeWithGranularity,
  onGranularityChange,
  chartRef
}) => {
  const [visibleTickCount, setVisibleTickCount] = useState<number>(0);

  const setVisibleTickCountRef = useRef<(count: number) => void>((count) => {
    setVisibleTickCount(count);
  });

  useEffect(() => {
    setVisibleTickCountRef.current = (count) => {
      setVisibleTickCount(count);
    };
  }, [setVisibleTickCount]);

  useEffect(() => {
    // @ts-ignore
    window.updateTickCount = (count: number) => {
      setVisibleTickCount(count);
    };

    return () => {
      // @ts-ignore
      delete window.updateTickCount;
    };
  }, []);

  const handleVisibleRangeChange = useCallback((params: { from: number; to: number; visibleRangeNs: number }) => {
    if (chartRef.current) {
      const count = chartRef.current.getVisibleTickCount();
      setVisibleTickCount(count);
    }
    
    onVisibleRangeChangeWithGranularity(params);
  }, [chartRef, onVisibleRangeChangeWithGranularity]);

  useEffect(() => {
    if (chartRef.current) {
      const initialCount = chartRef.current.getVisibleTickCount();
      setVisibleTickCount(initialCount);
      
      const intervalId = setInterval(() => {
        if (chartRef.current) {
          const count = chartRef.current.getVisibleTickCount();
          if (count !== visibleTickCount) {
            setVisibleTickCount(count);
          }
        }
      }, 500);
      
      return () => clearInterval(intervalId);
    }
  }, [chartRef]);

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h2 className="text-xl font-semibold">Time Series Chart</h2>
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Drag to pan, scroll to zoom, double-click to reset view</span>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      <div className="flex flex-wrap gap-3 mb-4">
        {currentGranularity && (
          <div className="bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600">
            <p className="text-sm flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="font-medium">Granularity:</span> <span className="ml-1">{currentGranularity.name}</span>
            </p>
          </div>
        )}
        
        <div className="bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-600">
          <p className="text-sm flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <span className="font-medium">Data Points:</span> <span className="ml-1">{visibleTickCount.toLocaleString()}</span>
            {currentGranularity && (
              <span className="ml-2 text-xs">
                <span className="text-gray-500">(min: {currentGranularity.minVal}, max: {currentGranularity.maxVal})</span>
                {visibleTickCount < currentGranularity.minVal && (
                  <span className="ml-1 text-orange-500 font-medium flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Too few
                  </span>
                )}
                {visibleTickCount > currentGranularity.maxVal && (
                  <span className="ml-1 text-orange-500 font-medium flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Too many
                  </span>
                )}
              </span>
            )}
          </p>
        </div>
      </div>
      
      {loading && (
        <div className="flex justify-center items-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
      
      {!loading && data && data.length > 0 && (
        <Chart
          data={data}
          onVisibleRangeChangeWithGranularity={handleVisibleRangeChange}
          onGranularityChange={onGranularityChange}
          ref={chartRef}
          height={500}
          currentGranularity={currentGranularity || undefined}
        />
      )}
      
      {!loading && (!data || data.length === 0) && !error && (
        <div className="flex flex-col items-center justify-center p-12 text-gray-500">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-lg font-medium">No data to display</p>
          <p className="text-sm">Upload a CSV file to visualize time series data</p>
        </div>
      )}
    </div>
  );
};

export default TimeSeriesDisplay;