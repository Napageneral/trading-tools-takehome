import React from 'react';
import { formatTimestamp } from '../utils/timeUtils';
import { Stats } from '../hooks/useStats';

interface DataStatsProps {
  stats: Stats | null;
}

const DataStats: React.FC<DataStatsProps> = ({ stats }) => {
  if (!stats) return null;

  return (
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
  );
};

export default DataStats; 