import axios from 'axios';
import { toast } from 'sonner';

export const API_URL = import.meta.env.VITE_API_BASE_URL || "http://sd-core-platform-test-alb-1933031983.us-east-1.elb.amazonaws.com:4000";

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
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