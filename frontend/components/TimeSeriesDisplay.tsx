import React, { forwardRef, MutableRefObject } from 'react';
import TimeSeriesChart, { TimeSeriesChartHandle } from './TimeSeriesChart';
import { LineData } from 'lightweight-charts';
import { formatTimestamp } from '../utils/timeUtils';

interface TimeSeriesDisplayProps {
  data: LineData[];
  loading: boolean;
  error: string | null;
  currentGranularity: string | null;
  startNs: string;
  endNs: string;
  onVisibleRangeChangeWithGranularity: (params: { from: number; to: number; visibleRangeNs: number }) => void;
  chartRef: MutableRefObject<TimeSeriesChartHandle | null>;
  onForceReload?: () => void;
}

const TimeSeriesDisplay: React.FC<TimeSeriesDisplayProps> = ({
  data,
  loading,
  error,
  currentGranularity,
  startNs,
  endNs,
  onVisibleRangeChangeWithGranularity,
  chartRef,
  onForceReload
}) => {
  const renderGranularityText = (gran: string | null) => {
    switch(gran) {
      case '1s': return '1 Second';
      case '1m': return '1 Minute';
      case '1h': return '1 Hour';
      case '1d': return '1 Day';
      default: return 'Raw';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Time Series Chart</h2>
        <div className="flex items-center gap-4">
          {onForceReload && (
            <button
              onClick={onForceReload}
              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-sm font-medium transition-colors"
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Force Reload Data'}
            </button>
          )}
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
      
      {/* Current granularity display */}
      {currentGranularity && (
        <div className="bg-green-50 dark:bg-green-900/30 p-2 rounded-lg mb-4">
          <p className="text-sm">
            <span className="font-medium">Current Granularity:</span> {renderGranularityText(currentGranularity)}
          </p>
        </div>
      )}
      
      {data.length > 0 ? (
        <div>
          <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Viewing:</span> {formatTimestamp(parseInt(startNs))} to {formatTimestamp(parseInt(endNs))}
          </div>
          <TimeSeriesChart
            ref={chartRef}
            data={data}
            onVisibleRangeChangeWithGranularity={onVisibleRangeChangeWithGranularity}
            height={500}
          />
        </div>
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
              <p>No data to display. Please wait for data to load.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TimeSeriesDisplay; 