'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { TimeSeriesChartHandle } from '@/components/TimeSeriesChart';
import DataStats from '@/components/DataStats';
import TimeSeriesControls from '@/components/TimeSeriesControls';
import TimeSeriesDisplay from '@/components/TimeSeriesDisplay';
import useStats from '@/hooks/useStats';
import useFileUpload from '@/hooks/useFileUpload';
import useTimeSeriesData from '@/hooks/useTimeSeriesData';
import { pickGranularity } from '@/utils/granularityUtils';

export default function Home() {
  // Use custom hooks for data management
  const { stats, error: statsError } = useStats();
  const { uploadFile, loading: uploadLoading, error: uploadError } = useFileUpload();
  
  // Dynamic granularity state
  const [dynamicGranularity, setDynamicGranularity] = useState<boolean>(true);
  
  // Reference to the chart component
  const chartRef = useRef<TimeSeriesChartHandle>(null);
  
  // Use the time series data hook
  const {
    chartData,
    loading: dataLoading,
    error: dataError,
    currentGranularity,
    startNs,
    endNs,
    fetchDataHttp,
    handleVisibleRangeChangeWithGranularity,
    forceReload,
  } = useTimeSeriesData({ dynamicGranularity });

  // Load initial data when stats are available
  useEffect(() => {
    if (stats && stats.min_timestamp_ns && stats.max_timestamp_ns) {
      const startNsValue = stats.min_timestamp_ns;
      const endNsValue = stats.max_timestamp_ns;
      
      // If dynamic granularity is enabled, fetch initial data with appropriate granularity
      if (dynamicGranularity) {
        const visibleRangeNs = endNsValue - startNsValue;
        const initialGranularity = pickGranularity(visibleRangeNs);
        fetchDataHttp(startNsValue, endNsValue, initialGranularity);
      }
    }
  }, [stats, dynamicGranularity, fetchDataHttp]);

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
        const initialGranularity = pickGranularity(visibleRangeNs);
        fetchDataHttp(startNsValue, endNsValue, initialGranularity);
      }
    }
  };

  // Handle reset view button click
  const handleResetView = useCallback(() => {
    // Reset to full dataset view
    if (stats && stats.min_timestamp_ns && stats.max_timestamp_ns) {
      const startNsValue = stats.min_timestamp_ns;
      const endNsValue = stats.max_timestamp_ns;
      
      // Calculate appropriate granularity for full view
      const visibleRangeNs = endNsValue - startNsValue;
      const newGranularity = pickGranularity(visibleRangeNs);
      
      console.log(`Resetting view to full dataset: ${new Date(startNsValue / 1_000_000).toLocaleString()} to ${new Date(endNsValue / 1_000_000).toLocaleString()}`);
      console.log(`Using granularity: ${newGranularity} for view range: ${visibleRangeNs}ns`);
      
      // Fetch data with appropriate granularity
      fetchDataHttp(startNsValue, endNsValue, newGranularity);
      
      // Fit chart content after a short delay to ensure data is loaded
      setTimeout(() => {
        if (chartRef.current) {
          chartRef.current.fitContent();
        }
      }, 500);
    }
  }, [stats, fetchDataHttp]);

  // Update the handleForceReload function to use logical range
  const handleForceReload = useCallback(() => {
    if (chartRef.current) {
      const visibleRange = chartRef.current.getVisibleRange();
      const logicalRange = chartRef.current.getVisibleLogicalRange();
      
      if (visibleRange) {
        console.log('Force reloading data for visible range:', visibleRange);
        console.log('Logical range:', logicalRange);
        forceReload(visibleRange, logicalRange);
      } else {
        console.log('No visible range available for force reload');
      }
    }
  }, [forceReload]);

  // Combine all errors
  const error = statsError || uploadError || dataError;
  
  // Combine loading states
  const loading = uploadLoading || dataLoading;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Timeseries Visualization</h1>
      
      {/* Stats display */}
      <DataStats stats={stats} />
      
      {/* Controls */}
      <TimeSeriesControls
        dynamicGranularity={dynamicGranularity}
        onDynamicGranularityChange={setDynamicGranularity}
        onResetView={handleResetView}
        onFileUpload={handleFileUpload}
        loading={loading}
      />
      
      {/* Error display */}
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p>{error}</p>
        </div>
      )}
      
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
        onForceReload={handleForceReload}
      />
    </div>
  );
} 