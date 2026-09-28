import axios from 'axios';
import { getToken, clearToken } from '../utils/storage';

const baseURL = `${(import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '')}/api`;

// Local models on CPU-only machines can need several minutes per answer (evaluation + next question).
const timeout = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 5 * 60 * 1000;

const client = axios.create({ baseURL, timeout });

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isAuthCall = error.config?.url?.startsWith('/auth/login') || error.config?.url?.startsWith('/auth/register');
    if (status === 401 && !isAuthCall && getToken()) {
      clearToken();
      window.dispatchEvent(new CustomEvent('prepai:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export default client;
