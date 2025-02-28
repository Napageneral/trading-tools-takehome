'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChartHandle } from '@/components/Chart';
import DataStats from '@/components/DataStats';
import TimeSeriesControls from '@/components/TimeSeriesControls';
import TimeSeriesDisplay from '@/components/TimeSeriesDisplay';
import useStats from '@/hooks/useStats';
import useFileUpload from '@/hooks/useFileUpload';
import useTimeSeriesData from '@/hooks/useTimeSeriesData';
import { GRANULARITIES, DEFAULT_GRANULARITY, Granularity, tick, oneSecond, oneMinute, hour, day } from '@/types/Granularity';

export default function Home() {
  // Use custom hooks for data management
  const { stats, error: statsError } = useStats();
  const { uploadFile, loading: uploadLoading, error: uploadError } = useFileUpload();
  
  // Dynamic granularity state
  const [dynamicGranularity, setDynamicGranularity] = useState<boolean>(true);
  
  // Reference to the chart component
  const chartRef = useRef<ChartHandle>(null);
  
  // Pan amount state
  const [panAmount, setPanAmount] = useState<number>(60_000_000_000); // 1 minute in ns
  
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
    forceReload,
    setGranularity,
    moveUpGran,
    moveDownGran,
    panLeft,
    panRight,
    setDynamicGranularity: setDynamicGranularityOption
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

  // Handle reset view button click
  const handleResetView = useCallback(() => {
    // Reset to full dataset view
    if (stats && stats.min_timestamp_ns && stats.max_timestamp_ns) {
      const startNsValue = stats.min_timestamp_ns;
      const endNsValue = stats.max_timestamp_ns;
      
      // Calculate appropriate granularity for full view
      const visibleRangeNs = endNsValue - startNsValue;
      
      // Simple granularity selection based on visible range
      let newGranularity = currentGranularity;
      if (visibleRangeNs > 10 * 86400_000_000_000) {  // > 10 days
        newGranularity = day;
      } else if (visibleRangeNs > 86400_000_000_000) {  // > 1 day
        newGranularity = hour;
      } else if (visibleRangeNs > 3600_000_000_000) {  // > 1 hour
        newGranularity = oneMinute;
      } else if (visibleRangeNs > 60_000_000_000) {  // > 1 minute
        newGranularity = oneSecond;
      } else {
        newGranularity = tick;
      }
      
      console.log(`Resetting view to full dataset: ${new Date(startNsValue / 1_000_000).toLocaleString()} to ${new Date(endNsValue / 1_000_000).toLocaleString()}`);
      console.log(`Using granularity: ${newGranularity.symbol} for view range: ${visibleRangeNs}ns`);
      
      // Fetch data with appropriate granularity
      loadData(startNsValue, endNsValue, newGranularity);
      
      // Fit chart content after a short delay to ensure data is loaded
      setTimeout(() => {
        if (chartRef.current) {
          chartRef.current.fitContent();
        }
      }, 500);
    }
  }, [stats, loadData, currentGranularity]);

  // Handle fit content
  const handleFitContent = () => {
    if (chartRef.current) {
      chartRef.current.resetFitContent();
      chartRef.current.fitContent();
    }
  };

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

  // Handle dynamic granularity toggle
  const handleDynamicGranularityToggle = (value: boolean) => {
    setDynamicGranularity(value);
    setDynamicGranularityOption(value);
  };

  // Handle pan amount change
  const handlePanAmountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPanAmount(parseInt(e.target.value));
  };

  // Combine all errors
  const error = statsError || uploadError || dataError;
  
  // Combine loading states
  const loading = uploadLoading || dataLoading;
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Timeseries Visualization</h1>
      
      {/* Stats display */}
      <DataStats stats={stats} />
      
      {/* Basic Controls */}
      <TimeSeriesControls
        dynamicGranularity={dynamicGranularity}
        onDynamicGranularityChange={handleDynamicGranularityToggle}
        onResetView={handleResetView}
        onFileUpload={handleFileUpload}
        loading={loading}
      />
      
      {/* Additional Controls */}
      <div className="flex flex-wrap gap-4 mb-4 p-4 bg-gray-100 rounded">
        <div>
          <button 
            onClick={handleFitContent}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Fit Content
          </button>
        </div>
        
        <div>
          <button 
            onClick={handleForceReload}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Force Reload
          </button>
        </div>
        
        <div className="flex flex-col">
          <label htmlFor="panAmount" className="text-sm text-gray-600">Pan Amount:</label>
          <select 
            id="panAmount" 
            value={panAmount} 
            onChange={handlePanAmountChange}
            className="p-1 border rounded"
          >
            <option value="1000000000">1 second</option>
            <option value="60000000000">1 minute</option>
            <option value="300000000000">5 minutes</option>
            <option value="3600000000000">1 hour</option>
            <option value="86400000000000">1 day</option>
          </select>
        </div>
        
        <div className="flex space-x-2">
          <button 
            onClick={() => panLeft(panAmount)}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            disabled={loading}
          >
            ⬅️ Pan Left
          </button>
          
          <button 
            onClick={() => panRight(panAmount)}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            disabled={loading}
          >
            Pan Right ➡️
          </button>
        </div>
      </div>
      
      {/* Granularity Control */}
      <div className="flex flex-wrap gap-4 mb-4 p-4 bg-gray-100 rounded">
        <div className="text-lg font-semibold">Granularity: {currentGranularity?.name || 'None'}</div>
        
        <div className="flex space-x-2">
          <button 
            onClick={moveUpGran}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
            disabled={!currentGranularity?.up || loading}
          >
            ⬆️ Coarser
          </button>
          
          <button 
            onClick={moveDownGran}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
            disabled={!currentGranularity?.down || loading}
          >
            ⬇️ Finer
          </button>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {Object.values(GRANULARITIES).map((gran) => (
            <button 
              key={gran.symbol}
              onClick={() => setGranularity(gran)}
              className={`px-3 py-1 rounded border ${
                currentGranularity?.symbol === gran.symbol 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white text-blue-500 hover:bg-blue-100'
              }`}
            >
              {gran.name}
            </button>
          ))}
        </div>
      </div>
      
      {/* Error display */}
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      {/* Status */}
      <div className="mb-4">
        {loading && <div className="text-blue-500">Loading data...</div>}
        {startNs && endNs && (
          <div className="text-gray-600">
            Time Range: {new Date(parseInt(startNs) / 1_000_000).toLocaleString()} to {new Date(parseInt(endNs) / 1_000_000).toLocaleString()}
          </div>
        )}
      </div>
      
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