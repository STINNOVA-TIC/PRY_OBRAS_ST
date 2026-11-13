import { compare, hash, hashSync } from 'bcryptjs';
import { randomBytes, randomInt } from 'node:crypto';

const COSTO_BCRYPT = 10;

/**
 * Política: 8 a 72 caracteres (72 es el límite de bcrypt), al menos una letra y un número.
 */
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
export const PASSWORD_MENSAJE =
  'La contraseña debe tener entre 8 y 72 caracteres, con al menos una letra y un número';

export function hashPassword(plano: string): Promise<string> {
  return hash(plano, COSTO_BCRYPT);
}

export function verificarPassword(
  plano: string,
  hashGuardado: string,
): Promise<boolean> {
  return compare(plano, hashGuardado);
}

/**
 * Hash de una cadena aleatoria. Se compara contra él cuando el email no existe,
 * para que el tiempo de respuesta no revele qué emails están registrados.
 */
export const HASH_SENTINELA = hashSync(
  randomBytes(16).toString('hex'),
  COSTO_BCRYPT,
);

/** Contraseña temporal legible (sin caracteres ambiguos) que cumple la política. */
export function generarPasswordTemporal(): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const todos = letras + numeros;
  const chars = [
    letras[randomInt(letras.length)],
    numeros[randomInt(numeros.length)],
  ];
  while (chars.length < 12) chars.push(todos[randomInt(todos.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
