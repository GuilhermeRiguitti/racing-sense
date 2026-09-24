/**
 * Identificadores tipados.
 *
 * `SessionId` e `ReferenceLapId` são os dois `string`, mas o compilador recusa
 * trocar um pelo outro. Custa nada em runtime e mata uma classe inteira de bug
 * de argumento na ordem errada.
 */
declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type SessionId = Brand<string, 'SessionId'>;
export type ReferenceLapId = Brand<string, 'ReferenceLapId'>;

export const toSessionId = (value: string): SessionId => value as SessionId;
export const toReferenceLapId = (value: string): ReferenceLapId => value as ReferenceLapId;
