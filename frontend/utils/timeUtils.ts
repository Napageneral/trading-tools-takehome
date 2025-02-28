// Helper function to format nanosecond timestamp to human-readable format
export const formatTimestamp = (timestampNs: number): string => {
  const date = new Date(timestampNs / 1_000_000); // Convert ns to ms
  return date.toLocaleString();
};

// Helper function to parse human-readable date to nanoseconds
export const parseTimestamp = (dateString: string): number | null => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.getTime() * 1_000_000; // Convert ms to ns
  } catch (e) {
    return null;
  }
}; 