'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import TimeSeriesChart from '@/components/TimeSeriesChart';
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

// Helper function to format nanosecond timestamp to human-readable format
const formatTimestamp = (timestampNs: number): string => {
  const date = new Date(timestampNs / 1_000_000); // Convert ns to ms
  return date.toLocaleString();
};

// Helper function to parse human-readable date to nanoseconds
const parseTimestamp = (dateString: string): number | null => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.getTime() * 1_000_000; // Convert ms to ns
  } catch (e) {
    return null;
  }
};

export default function Home() {
  // State for data
  const [chartData, setChartData] = useState<LineData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  // State for time range inputs (human-readable format)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // State for actual nanosecond values (used for API calls)
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
          
          // Set human-readable dates
          setStartDate(formatTimestamp(data.min_timestamp_ns));
          setEndDate(formatTimestamp(data.max_timestamp_ns));
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
        setError('Failed to fetch dataset statistics');
      }
    };

    fetchStats();
  }, []);

  // Update nanosecond values when human-readable dates change
  useEffect(() => {
    const startNsValue = parseTimestamp(startDate);
    if (startNsValue) {
      setStartNs(startNsValue.toString());
    }
  }, [startDate]);

  useEffect(() => {
    const endNsValue = parseTimestamp(endDate);
    if (endNsValue) {
      setEndNs(endNsValue.toString());
    }
  }, [endDate]);

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
      setError('Please enter valid start and end dates');
      return;
    }

    setLoading(true);
    setError(null);
    
    // Clear previous data
    ringBufferRef.current.clear();
    setChartData([]);

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
          
          // Set human-readable dates
          setStartDate(formatTimestamp(statsData.min_timestamp_ns));
          setEndDate(formatTimestamp(statsData.max_timestamp_ns));
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
      
      // Update human-readable dates
      setStartDate(formatTimestamp(fromNs));
      setEndDate(formatTimestamp(toNs));
      
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
                {formatTimestamp(stats.min_timestamp_ns)} to {formatTimestamp(stats.max_timestamp_ns)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300">Value Range</p>
              <p className="font-medium">{stats.min_value.toFixed(2)} to {stats.max_value.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="datetime-local"
              value={startDate.replace(' ', 'T')}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              type="datetime-local"
              value={endDate.replace(' ', 'T')}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
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
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Time Series Chart</h2>
          <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Drag to pan, scroll to zoom, double-click to reset view</span>
          </div>
        </div>
        
        {chartData.length > 0 ? (
          <div>
            <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">Viewing:</span> {formatTimestamp(parseInt(startNs))} to {formatTimestamp(parseInt(endNs))}
            </div>
            <TimeSeriesChart
              data={chartData}
              onRangeChange={handleChartRangeChange}
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
                <p>No data to display. Please fetch data first.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 