import Database from 'better-sqlite3';
import { SCHEMA } from './schema.js';

export type SqliteDatabase = Database.Database;

/**
 * Abre (e migra) o banco local.
 *
 * `:memory:` é usado pelos testes — inclusive pelas suítes de contrato das
 * portas, que rodam iguais aqui e no adapter em memória.
 */
export function openDatabase(file: string): SqliteDatabase {
  const db = new Database(file);
  db.exec(SCHEMA);
  return db;
}
