import axios, { AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url ?? '';
    // El login y la página pública de carga no tienen sesión que cerrar
    const sinSesion = url.includes('/auth/login') || url.includes('/publico/');
    if (error.response?.status === 401 && !sinSesion) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

/** Mensaje legible de un error de la API (NestJS devuelve message como string o string[]). */
export function mensajeError(err: unknown, porDefecto = 'Ocurrió un error inesperado'): string {
  const e = err as AxiosError<{ message?: string | string[] }>;
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.join('. ');
  return m || porDefecto;
}

/** Envía un archivo como multipart (campo "archivo"). */
export function subirMultipart<T>(url: string, archivo: File, metodo: 'post' | 'put' = 'post', extra?: Record<string, string>) {
  const fd = new FormData();
  fd.append('archivo', archivo);
  Object.entries(extra ?? {}).forEach(([k, v]) => fd.append(k, v));
  return api.request<T>({ url, method: metodo, data: fd, headers: { 'Content-Type': 'multipart/form-data' } });
}
