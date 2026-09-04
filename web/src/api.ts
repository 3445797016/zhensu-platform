import axios from 'axios';

const http = axios.create({ baseURL: '/api', timeout: 120000 });

http.interceptors.response.use(
  (r) => r,
  (e) => {
    const msg = e?.response?.data?.error || e?.message || '请求失败';
    return Promise.reject(new Error(msg));
  }
);

export const api = {
  get: async (u: string, p?: any) => (await http.get(u, { params: p })).data,
  post: async (u: string, body?: any, p?: any) => (await http.post(u, body, { params: p })).data,
  put: async (u: string, body?: any, p?: any) => (await http.put(u, body, { params: p })).data,
  del: async (u: string, p?: any) => (await http.delete(u, { params: p })).data,
};

export const wsUrl = (path: string) => {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${path}`;
};
