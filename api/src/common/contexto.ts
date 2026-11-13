import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/** Datos de la petición en curso (IP y navegador) para la bitácora, sin pasarlos por cada servicio. */
export interface ContextoPeticion {
  ip: string | null;
  agente: string | null;
}

export const contexto = new AsyncLocalStorage<ContextoPeticion>();

export function middlewareContexto(req: Request, _res: Response, next: NextFunction) {
  // Detrás de nginx la IP real llega en X-Real-IP (nginx la fija; no la manda el navegador)
  const real = String(req.headers['x-real-ip'] ?? '').trim();
  const ip = (real || req.socket.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 64);
  const agente = String(req.headers['user-agent'] ?? '').slice(0, 300);
  contexto.run({ ip: ip || null, agente: agente || null }, () => next());
}
