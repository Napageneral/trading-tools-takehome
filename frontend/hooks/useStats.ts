import { useState, useEffect } from 'react';
import { API_URL } from '../constants/api';

export interface Stats {
  count: number;
  min_timestamp_ns: number;
  max_timestamp_ns: number;
  min_value: number;
  max_value: number;
}

export const useStats = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/stats`);
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }
      const data = await response.json();
      setStats(data);
      return data;
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Failed to fetch dataset statistics');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return {
    stats,
    loading,
    error,
    fetchStats
  };
};

export default useStats; 