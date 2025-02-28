'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChartHandle } from '@/components/Chart';
import DataStats from '@/components/DataStats';
import TimeSeriesDisplay from '@/components/TimeSeriesDisplay';
import useStats from '@/hooks/useStats';
import useFileUpload from '@/hooks/useFileUpload';
import useTimeSeriesData from '@/hooks/useTimeSeriesData';
import { GRANULARITIES, DEFAULT_GRANULARITY, Granularity, tick, oneSecond, oneMinute, hour, day } from '@/types/Granularity';
import { formatTimestamp } from '@/utils/timeUtils';

export default function Home() {
  // Use custom hooks for data management
  const { stats, error: statsError } = useStats();
  const { uploadFile, loading: uploadLoading, error: uploadError } = useFileUpload();
  
  // Dynamic granularity is always enabled
  const dynamicGranularity = true;
  
  // Reference to the chart component
  const chartRef = useRef<ChartHandle>(null);
  
  // Use the time series data hook
  const {
    chartData,
    loading: dataLoading,
    error: dataError,
    currentGranularity,
    startNs,
    endNs,
    loadData,
    handleVisibleRangeChangeWithGranularity,
  } = useTimeSeriesData({ dynamicGranularity });

  // Load initial data when stats are available
  useEffect(() => {
    if (stats && stats.min_timestamp_ns && stats.max_timestamp_ns) {
      const startNsValue = stats.min_timestamp_ns;
      const endNsValue = stats.max_timestamp_ns;
      
      // If dynamic granularity is enabled, fetch initial data with appropriate granularity
      if (dynamicGranularity) {
        const visibleRangeNs = endNsValue - startNsValue;
        // Use the visible range to determine granularity
        let initialGranularity = currentGranularity;
        
        // Simple granularity selection based on visible range
        if (visibleRangeNs > 10 * 86400_000_000_000) {  // > 10 days
          initialGranularity = day;
        } else if (visibleRangeNs > 86400_000_000_000) {  // > 1 day
          initialGranularity = hour;
        } else if (visibleRangeNs > 3600_000_000_000) {  // > 1 hour
          initialGranularity = oneMinute;
        } else if (visibleRangeNs > 60_000_000_000) {  // > 1 minute
          initialGranularity = oneSecond;
        } else {
          initialGranularity = tick;
        }
        
        loadData(startNsValue, endNsValue, initialGranularity);
      }
    }
  }, [stats, dynamicGranularity, loadData, currentGranularity]);

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const result = await uploadFile(file);
    
    if (result.success) {
      alert(`File uploaded successfully: ${result.message}`);
      
      // If stats were updated, set new time range and fetch data
      if (result.stats && result.stats.min_timestamp_ns && result.stats.max_timestamp_ns) {
        const startNsValue = result.stats.min_timestamp_ns;
        const endNsValue = result.stats.max_timestamp_ns;
        
        // Fetch data with appropriate granularity
        const visibleRangeNs = endNsValue - startNsValue;
        
        // Simple granularity selection based on visible range
        let initialGranularity = currentGranularity;
        if (visibleRangeNs > 10 * 86400_000_000_000) {  // > 10 days
          initialGranularity = day;
        } else if (visibleRangeNs > 86400_000_000_000) {  // > 1 day
          initialGranularity = hour;
        } else if (visibleRangeNs > 3600_000_000_000) {  // > 1 hour
          initialGranularity = oneMinute;
        } else if (visibleRangeNs > 60_000_000_000) {  // > 1 minute
          initialGranularity = oneSecond;
        } else {
          initialGranularity = tick;
        }
        
        loadData(startNsValue, endNsValue, initialGranularity);
      }
    }
  };

  // Combine all errors
  const error = statsError || uploadError || dataError;
  
  // Combine loading states
  const loading = uploadLoading || dataLoading;
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Timeseries Visualization</h1>
      
      {/* Stats display with file upload */}
      <div className="mb-6 bg-gray-50 dark:bg-gray-800 p-6 rounded-lg shadow">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex-grow">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Dataset Statistics</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-700 p-3 rounded-md shadow-sm">
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Points</div>
                <div className="text-xl font-medium">{stats?.count?.toLocaleString() || "No data"}</div>
              </div>
              <div className="bg-white dark:bg-gray-700 p-3 rounded-md shadow-sm">
                <div className="text-sm text-gray-500 dark:text-gray-400">Time Range</div>
                <div className="text-sm font-medium">
                  {stats?.min_timestamp_ns && stats?.max_timestamp_ns 
                    ? `${formatTimestamp(stats.min_timestamp_ns)} to ${formatTimestamp(stats.max_timestamp_ns)}`
                    : "No data"}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-700 p-3 rounded-md shadow-sm">
                <div className="text-sm text-gray-500 dark:text-gray-400">Value Range</div>
                <div className="text-sm font-medium">
                  {stats?.min_value !== undefined && stats?.max_value !== undefined
                    ? `${stats.min_value.toFixed(2)} to ${stats.max_value.toFixed(2)}`
                    : "No data"}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex-shrink-0">
            <div className="bg-white dark:bg-gray-700 p-4 rounded-md shadow-sm">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Import Data</h3>
              <div className="flex items-center">
                <label 
                  htmlFor="csv-upload" 
                  className="flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload CSV File
                </label>
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={loading}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Error display */}
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      {/* Status */}
      {loading && <div className="text-blue-500 mb-4">Loading data...</div>}
      
      {/* Chart */}
      <TimeSeriesDisplay
        data={chartData}
        loading={loading}
        error={dataError}
        currentGranularity={currentGranularity}
        startNs={startNs}
        endNs={endNs}
        onVisibleRangeChangeWithGranularity={handleVisibleRangeChangeWithGranularity}
        chartRef={chartRef}
      />
    </div>
  );
} 