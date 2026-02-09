import axios from 'axios';
import { toast } from 'sonner';

export const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || 'An unexpected error occurred';    
    if (error.response?.status >= 500) {
        toast.error('Server error: ' + message);
    } else if (error.code === 'ERR_NETWORK') {
        toast.error('Network error. Please check your connection.');
    }
    
    return Promise.reject(error);
  }
);

export default api;