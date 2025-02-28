import { useState } from 'react';
import { API_URL } from '../constants/api';
import useStats from './useStats';

export const useFileUpload = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { fetchStats } = useStats();

  const uploadFile = async (file: File) => {
    if (!file) return { success: false, message: 'No file selected' };

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
      
      // Refresh stats after upload
      const updatedStats = await fetchStats();
      
      return { 
        success: true, 
        message: result.message, 
        stats: updatedStats 
      };
    } catch (err) {
      console.error('Error uploading file:', err);
      const errorMessage = 'File upload failed';
      setError(errorMessage);
      return { 
        success: false, 
        message: errorMessage 
      };
    } finally {
      setLoading(false);
    }
  };

  return {
    uploadFile,
    loading,
    error
  };
};

export default useFileUpload; 