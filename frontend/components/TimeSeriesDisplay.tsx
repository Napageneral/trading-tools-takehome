import React, { useState, useEffect, MutableRefObject } from 'react';
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
  chartRef
}) => {
  // Add state for visible tick count
  const [visibleTickCount, setVisibleTickCount] = useState<number>(0);

  // Effect to update visible tick count - using a separate effect without visibleTickCount dependency
  // to avoid unnecessary re-renders and potential stale closures
  useEffect(() => {
    if (!chartRef.current) return;
    
    // Function to update the tick count
    const updateTickCount = () => {
      if (chartRef.current) {
        const count = chartRef.current.getVisibleTickCount();
        setVisibleTickCount(prevCount => {
          if (prevCount !== count) {
            console.log('Visible tick count updated:', count);
          }
          return count;
        });
      }
    };
    
    // Set initial tick count after a short delay to ensure chart is rendered
    const initialTimer = setTimeout(() => {
      updateTickCount();
    }, 500);
    
    // Set up event listener for chart range changes instead of using an interval
    document.addEventListener('chartRangeChanged', updateTickCount);
    
    // Still use a polling interval as a fallback - reduced frequency to every 2 seconds
    const intervalId = setInterval(updateTickCount, 2000);
    
    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
      document.removeEventListener('chartRangeChanged', updateTickCount);
    };
  }, [chartRef, data]); // Only re-run when chart ref or data changes

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Time Series Chart</h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Drag to pan, scroll to zoom, double-click to reset view</span>
          </div>
        </div>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      {/* Chart information display */}
      <div className="flex flex-wrap gap-4 mb-4">
        {/* Current granularity display */}
        {currentGranularity && (
          <div className="bg-green-50 dark:bg-green-900/30 p-2 rounded-lg">
            <p className="text-sm">
              <span className="font-medium">Current Granularity:</span> {currentGranularity.name}
            </p>
          </div>
        )}
        
        {/* Visible tick count display */}
        <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded-lg">
          <p className="text-sm">
            <span className="font-medium">Visible Data Points:</span> {visibleTickCount}
            {currentGranularity && (
              <span className="ml-1 text-xs text-gray-500">
                (min: {currentGranularity.minVal}, max: {currentGranularity.maxVal})
                {visibleTickCount < currentGranularity.minVal && (
                  <span className="ml-1 text-orange-500">Too few - might switch to finer granularity</span>
                )}
                {visibleTickCount > currentGranularity.maxVal && (
                  <span className="ml-1 text-orange-500">Too many - might switch to coarser granularity</span>
                )}
              </span>
            )}
          </p>
        </div>
      </div>
      
      {data.length > 0 ? (
        <Chart
          ref={chartRef}
          data={data}
          onVisibleRangeChangeWithGranularity={onVisibleRangeChangeWithGranularity}
          height={500}
          currentGranularity={currentGranularity || undefined}
        />
      ) : (
        <div className="h-[500px] flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded">
          {loading ? (
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-2"></div>
              <p>Loading data...</p>
            </div>
          ) : (
            <div className="text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-gray-500">No data to display</p>
              <p className="text-gray-400 text-sm mt-1">Try adjusting the filters or loading a dataset</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TimeSeriesDisplay; 