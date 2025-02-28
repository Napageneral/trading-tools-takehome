import React from 'react';

interface TimeSeriesControlsProps {
  dynamicGranularity: boolean;
  onDynamicGranularityChange: (value: boolean) => void;
  onResetView: () => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  loading: boolean;
}

const TimeSeriesControls: React.FC<TimeSeriesControlsProps> = ({
  dynamicGranularity,
  onDynamicGranularityChange,
  onResetView,
  onFileUpload,
  loading
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="dynamicGranularity"
            checked={dynamicGranularity}
            onChange={(e) => onDynamicGranularityChange(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="dynamicGranularity" className="text-sm font-medium">
            Enable Dynamic Granularity (automatically adjust detail level when zooming)
          </label>
        </div>
        
        <button
          onClick={onResetView}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Reset View
        </button>
      </div>
      
      <div className="mt-4">
        <label className="block text-sm font-medium mb-1">Upload CSV File</label>
        <input
          type="file"
          accept=".csv"
          onChange={onFileUpload}
          className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          disabled={loading}
        />
      </div>
    </div>
  );
};

export default TimeSeriesControls; 