import axios from 'axios';
import { toast } from 'sonner';

export const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const PUBLIC_PATHS = new Set<string>([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
  '/design',
]);

const isOnPublicPage = () => PUBLIC_PATHS.has(window.location.pathname);

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
    const status = error.response?.status;

    if (status === 401) {
      if (!isOnPublicPage()) {
        window.location.href = '/login';
      }
      // Suppress the generic error toast either way — a 401 on a public page
      // is expected, and on a protected page the redirect itself is enough.
      return Promise.reject(error);
    }

    if (status >= 500) {
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