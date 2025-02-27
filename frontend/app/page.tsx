'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import TimeSeriesChart from '@/components/TimeSeriesChart';
import DataTable from '@/components/DataTable';
import { RingBuffer } from '@/components/RingBuffer';
import { LineData } from 'lightweight-charts';

// API URL - change this to match your backend
const API_URL = 'http://localhost:8000';

// Predefined granularities
const GRANULARITIES = [
  { label: 'Raw', value: null },
  { label: '1 Second', value: '1s' },
  { label: '1 Minute', value: '1m' },
  { label: '1 Hour', value: '1h' },
  { label: '1 Day', value: '1d' },
];

export default function Home() {
  // State for data
  const [chartData, setChartData] = useState<LineData[]>([]);
  const [tableData, setTableData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  // State for time range inputs
  const [startNs, setStartNs] = useState<string>('');
  const [endNs, setEndNs] = useState<string>('');
  const [granularity, setGranularity] = useState<string | null>(null);

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);
  
  // Ring buffer for efficient data handling
  const ringBufferRef = useRef(new RingBuffer<LineData>(100000));

  // Fetch stats on initial load
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${API_URL}/stats`);
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }
        const data = await response.json();
        setStats(data);
        
        // Set default time range based on stats
        if (data.min_timestamp_ns && data.max_timestamp_ns) {
          setStartNs(data.min_timestamp_ns.toString());
          setEndNs(data.max_timestamp_ns.toString());
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
        setError('Failed to fetch dataset statistics');
      }
    };

    fetchStats();
  }, []);

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`ws://${API_URL.replace('http://', '')}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      // Send initial request
      ws.send(JSON.stringify({
        start_ns: parseInt(startNs),
        end_ns: parseInt(endNs),
        granularity: granularity
      }));
    };

    ws.onmessage = (event) => {
      const chunk = JSON.parse(event.data);
      
      if (Array.isArray(chunk)) {
        if (chunk.length === 0) {
          // Empty chunk signals end of data
          setLoading(false);
          return;
        }

        // Process data for chart and table
        const newTableData = [...chunk];
        
        // Convert to format expected by lightweight-charts
        const newChartData = chunk.map((point: any) => ({
          time: point.timestamp_ns / 1_000_000_000, // Convert ns to seconds for chart
          value: point.value
        }));

        // Add to ring buffer
        newChartData.forEach((point: LineData) => {
          ringBufferRef.current.push(point);
        });

        // Update chart with all data in ring buffer
        setChartData(ringBufferRef.current.toArray());
        
        // Update table with new chunk only (to avoid performance issues)
        setTableData(prev => [...prev, ...newTableData]);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error');
      setLoading(false);
    };

    return ws;
  }, [startNs, endNs, granularity]);

  // Handle fetch button click
  const handleFetch = useCallback(() => {
    if (!startNs || !endNs) {
      setError('Please enter start and end timestamps');
      return;
    }

    setLoading(true);
    setError(null);
    
    // Clear previous data
    ringBufferRef.current.clear();
    setChartData([]);
    setTableData([]);

    // Connect to WebSocket and fetch data
    connectWebSocket();
  }, [startNs, endNs, granularity, connectWebSocket]);

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('File upload failed');
      }

      const result = await response.json();
      alert(`File uploaded successfully: ${result.message}`);
      
      // Refresh stats after upload
      const statsResponse = await fetch(`${API_URL}/stats`);
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
        
        // Update time range based on new stats
        if (statsData.min_timestamp_ns && statsData.max_timestamp_ns) {
          setStartNs(statsData.min_timestamp_ns.toString());
          setEndNs(statsData.max_timestamp_ns.toString());
        }
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('File upload failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle chart range change (for zooming/panning)
  const handleChartRangeChange = useCallback(({ from, to }: { from: number; to: number }) => {
    // Convert seconds back to nanoseconds
    const fromNs = Math.floor(from * 1_000_000_000);
    const toNs = Math.ceil(to * 1_000_000_000);
    
    // Only update if range has changed significantly
    if (
      Math.abs(fromNs - parseInt(startNs)) > 1_000_000_000 ||
      Math.abs(toNs - parseInt(endNs)) > 1_000_000_000
    ) {
      setStartNs(fromNs.toString());
      setEndNs(toNs.toString());
      
      // Optionally, you could auto-fetch here for continuous panning
      // handleFetch();
    }
  }, [startNs, endNs]);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Timeseries Visualization</h1>
      
      {/* Stats display */}
      {stats && (
        <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg mb-6">
          <h2 className="text-lg font-semibold mb-2">Dataset Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Total Points</p>
              <p className="font-medium">{stats.count.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Time Range</p>
              <p className="font-medium">
                {new Date(stats.min_timestamp_ns / 1_000_000).toISOString()} to {new Date(stats.max_timestamp_ns / 1_000_000).toISOString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Value Range</p>
              <p className="font-medium">{stats.min_value} to {stats.max_value}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Timestamp (ns)</label>
            <input
              type="text"
              value={startNs}
              onChange={(e) => setStartNs(e.target.value)}
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              placeholder="e.g. 1721395800000000000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Timestamp (ns)</label>
            <input
              type="text"
              value={endNs}
              onChange={(e) => setEndNs(e.target.value)}
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              placeholder="e.g. 1721395900000000000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Granularity</label>
            <select
              value={granularity || ''}
              onChange={(e) => setGranularity(e.target.value === '' ? null : e.target.value)}
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            >
              {GRANULARITIES.map((g) => (
                <option key={g.label} value={g.value || ''}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleFetch}
              disabled={loading}
              className="w-full p-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
            >
              {loading ? 'Loading...' : 'Fetch Data'}
            </button>
          </div>
        </div>
        
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">Upload CSV File</label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            disabled={loading}
          />
        </div>
      </div>
      
      {/* Error display */}
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
          <p>{error}</p>
        </div>
      )}
      
      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4">Time Series Chart</h2>
        {chartData.length > 0 ? (
          <TimeSeriesChart
            data={chartData}
            onRangeChange={handleChartRangeChange}
            height={400}
          />
        ) : (
          <div className="h-[400px] flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded">
            {loading ? (
              <p>Loading data...</p>
            ) : (
              <p>No data to display. Please fetch data first.</p>
            )}
          </div>
        )}
      </div>
      
      {/* Data Table */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">Data Table</h2>
        {tableData.length > 0 ? (
          <DataTable data={tableData} height={400} />
        ) : (
          <div className="h-[400px] flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded">
            {loading ? (
              <p>Loading data...</p>
            ) : (
              <p>No data to display. Please fetch data first.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 