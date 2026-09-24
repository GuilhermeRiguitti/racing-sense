import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
) => Promise<Buffer>;

/**
 * Tamanho da chave derivada e do sal, em bytes.
 *
 * Os valores recomendados pelo próprio Node para `scrypt`; o custo fica no
 * padrão dele (N = 16384), que é o que a documentação indica para senha.
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** `scrypt$<sal>$<chave>`, em base64url. O prefixo deixa trocar o algoritmo depois. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** Compara em tempo constante: tempo de resposta não pode dizer quão perto a senha chegou. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || salt === undefined || key === undefined) {
    return false;
  }
  const expected = Buffer.from(key, 'base64url');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
