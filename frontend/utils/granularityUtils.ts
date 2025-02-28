// Helper function to pick granularity based on visible range
export const pickGranularity = (visibleRangeNs: number): string => {
  if (visibleRangeNs > 10 * 86400_000_000_000) { // > 10 days
    return "1d";
  } else if (visibleRangeNs > 86400_000_000_000) { // > 1 day
    return "1h";
  } else if (visibleRangeNs > 3600_000_000_000) { // > 1 hour
    return "1m";
  } else {
    return "1s";
  }
};

// Helper function to pick granularity with hysteresis to prevent jitter
export const pickGranularityWithHysteresis = (visibleRangeNs: number, currentGranularity: string | null): string => {
  // Define thresholds with hysteresis
  const thresholds = [
    { gran: '1s', min: 0, max: 3600_000_000_000 }, // up to 1 hour
    { gran: '1m', min: 3600_000_000_000 * 0.8, max: 86400_000_000_000 * 0.8 }, // ~0.8h to ~0.8d
    { gran: '1h', min: 86400_000_000_000 * 0.8, max: 10 * 86400_000_000_000 * 0.8 }, // ~0.8d to ~8d
    { gran: '1d', min: 10 * 86400_000_000_000 * 0.8, max: Number.MAX_SAFE_INTEGER }, // >8d
  ];
  
  // If we have a current granularity, apply hysteresis
  if (currentGranularity) {
    switch (currentGranularity) {
      case '1s':
        // When at 1s, require 20% more than threshold to go to 1m
        if (visibleRangeNs > 3600_000_000_000 * 1.2) {
          return '1m';
        }
        return '1s';
        
      case '1m':
        // When at 1m, require 20% more to go to 1h, or 20% less to go to 1s
        if (visibleRangeNs > 86400_000_000_000 * 1.2) {
          return '1h';
        } else if (visibleRangeNs < 3600_000_000_000 * 0.8) {
          return '1s';
        }
        return '1m';
        
      case '1h':
        // When at 1h, require 20% more to go to 1d, or 20% less to go to 1m
        if (visibleRangeNs > 10 * 86400_000_000_000 * 1.2) {
          return '1d';
        } else if (visibleRangeNs < 86400_000_000_000 * 0.8) {
          return '1m';
        }
        return '1h';
        
      case '1d':
        // When at 1d, require 20% less to go to 1h
        if (visibleRangeNs < 10 * 86400_000_000_000 * 0.8) {
          return '1h';
        }
        return '1d';
    }
  }
  
  // If no current granularity or not handled above, use standard thresholds
  for (const threshold of thresholds) {
    if (visibleRangeNs >= threshold.min && visibleRangeNs < threshold.max) {
      return threshold.gran;
    }
  }
  
  // Fallback
  return pickGranularity(visibleRangeNs);
}; 