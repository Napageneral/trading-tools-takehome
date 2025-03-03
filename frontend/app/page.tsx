'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChartHandle } from '@/components/Chart';
import TimeSeriesDisplay from '@/components/TimeSeriesDisplay';
import useStats from '@/hooks/useStats';
import useFileUpload from '@/hooks/useFileUpload';
import useTimeSeriesData from '@/hooks/useTimeSeriesData';
import { GRANULARITIES, DEFAULT_GRANULARITY, Granularity, tick, oneSecond, oneMinute, hour, day } from '@/types/Granularity';

export default function Home() {
  const { stats, error: statsError } = useStats();
  const { uploadFile, loading: uploadLoading, error: uploadError } = useFileUpload();
  
  const dynamicGranularity = true;
  
  const chartRef = useRef<ChartHandle>(null);
  
  const {
    chartData,
    loading: dataLoading,
    error: dataError,
    currentGranularity,
    startNs,
    endNs,
    loadData,
    handleVisibleRangeChangeWithGranularity,
    setGranularity,
    debugLoad,
    debugStreamRight,
    debugStreamLeft,
  } = useTimeSeriesData({ dynamicGranularity });

  const [selectedGranSymbol, setSelectedGranSymbol] = useState(currentGranularity.symbol);

  useEffect(() => {
    if (stats && stats.min_timestamp_ns && stats.max_timestamp_ns) {
      const startNsValue = stats.min_timestamp_ns;
      const endNsValue = stats.max_timestamp_ns;
      
      if (dynamicGranularity) {
        const visibleRangeNs = endNsValue - startNsValue;
        let initialGranularity = currentGranularity;
        
        if (visibleRangeNs > 10 * 86400_000_000_000) {
          initialGranularity = day;
        } else if (visibleRangeNs > 86400_000_000_000) {
          initialGranularity = hour;
        } else if (visibleRangeNs > 3600_000_000_000) {
          initialGranularity = oneMinute;
        } else if (visibleRangeNs > 60_000_000_000) {
          initialGranularity = oneSecond;
        } else {
          initialGranularity = tick;
        }
        
        loadData(startNsValue, endNsValue, initialGranularity);
      }
    }
  }, [stats, dynamicGranularity, loadData, currentGranularity]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const result = await uploadFile(file);
    
    if (result.success) {
      alert(`File uploaded successfully: ${result.message}`);
      
      if (result.stats && result.stats.min_timestamp_ns && result.stats.max_timestamp_ns) {
        const startNsValue = result.stats.min_timestamp_ns;
        const endNsValue = result.stats.max_timestamp_ns;
        
        const visibleRangeNs = endNsValue - startNsValue;
        
        let initialGranularity = currentGranularity;
        if (visibleRangeNs > 10 * 86400_000_000_000) {
          initialGranularity = day;
        } else if (visibleRangeNs > 86400_000_000_000) {
          initialGranularity = hour;
        } else if (visibleRangeNs > 3600_000_000_000) {
          initialGranularity = oneMinute;
        } else if (visibleRangeNs > 60_000_000_000) {
          initialGranularity = oneSecond;
        } else {
          initialGranularity = tick;
        }
        
        loadData(startNsValue, endNsValue, initialGranularity);
      }
    }
  };

  const error = statsError || uploadError || dataError;
  
  const loading = uploadLoading || dataLoading;
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Timeseries Visualization</h1>
      
      <div className="mb-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex-grow">
            <h2 className="text-lg font-semibold mb-3">Dataset Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {stats && (
                <>
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Points</p>
                    <p className="text-xl font-semibold">{stats.count.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Time Range</p>
                    <p className="text-sm font-medium">
                      {new Date(stats.min_timestamp_ns / 1_000_000).toLocaleString()} to<br />
                      {new Date(stats.max_timestamp_ns / 1_000_000).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Value Range</p>
                    <p className="text-xl font-semibold">{stats.min_value.toFixed(2)} to {stats.max_value.toFixed(2)}</p>
                  </div>
                </>
              )}
              {!stats && (
                <div className="col-span-3 text-gray-500 italic">
                  No dataset loaded. Please upload a CSV file to begin.
                </div>
              )}
            </div>
          </div>
          
          <div className="md:border-l md:pl-6 md:ml-2 flex flex-col justify-center">
            <h2 className="text-lg font-semibold mb-3">Upload Dataset</h2>
            <div className="flex flex-col">
              <label className="mb-2 text-sm text-gray-600 dark:text-gray-300">
                Select a CSV file to visualize
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
                disabled={loading}
              />
              {loading && (
                <div className="mt-2 flex items-center text-blue-600">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      <TimeSeriesDisplay
        data={chartData}
        loading={loading}
        error={dataError}
        currentGranularity={currentGranularity}
        overallStartNs={stats ? stats.min_timestamp_ns : undefined}
        overallEndNs={stats ? stats.max_timestamp_ns : undefined}
        startNs={startNs}
        endNs={endNs}
        onVisibleRangeChangeWithGranularity={handleVisibleRangeChangeWithGranularity}
        onGranularityChange={setGranularity}
        chartRef={chartRef}
      />

      <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-md">
        <h2 className="text-lg font-semibold mb-2">Debug Actions</h2>
        <div className="flex gap-4 items-center">
          <select
            value={selectedGranSymbol}
            onChange={(e) => setSelectedGranSymbol(e.target.value)}
            className="p-2 rounded-md"
          >
            {Object.keys(GRANULARITIES).map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
          <button
            onClick={() => debugLoad(GRANULARITIES[selectedGranSymbol])}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Debug Load
          </button>
          <button
            onClick={debugStreamLeft}
            className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600"
          >
            Debug Stream Left
          </button>
          <button
            onClick={debugStreamRight}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
          >
            Debug Stream Right
          </button>
        </div>
      </div>
    </div>
  );
} 