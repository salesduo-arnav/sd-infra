import axios from 'axios';
import { toast } from 'sonner';

export const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const orgId = localStorage.getItem("activeOrganizationId");
  if (orgId) {
    config.headers['x-organization-id'] = orgId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Prevent 401 redirect loop by not redirecting if already on /login
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      // Could also trigger a global auth reset here if needed
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (error.response?.status >= 500) {
      toast.error('An internal server error occurred. Please try again later.');
    } else if (error.code === 'ERR_NETWORK') {
      toast.error('Network error. Please check your connection.');
    } else {
      const message = error.response?.data?.message || 'An unexpected error occurred';
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default api;