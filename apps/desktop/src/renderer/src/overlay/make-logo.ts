/// <reference types="vite/client" />

/**
 * A logo de cada fabricante, pelo `id` que o domínio reconhece no nome do carro
 * (`apps/desktop/src/main/domain/driver.ts`, lista `MAKES`).
 *
 * O arquivo mora em `./logos/<id>.svg` — `ferrari.svg`, `mercedes-amg.svg`,
 * `alfa-romeo.svg`. Fabricante sem arquivo aparece com a sigla; não é erro, é
 * logo que ainda não entrou. Os ids esperados são os da lista `MAKES`.
 *
 * O Vite resolve os arquivos no build: SVG pequeno vira `data:` URL, o resto vai
 * para `assets/` com hash. Nada é lido do disco em runtime.
 */
const LOGOS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./logos/*.svg', { eager: true, query: '?url', import: 'default' }),
  ).map(([path, url]) => [path.slice('./logos/'.length, -'.svg'.length), url]),
);

/** Os ids que têm arquivo em `./logos/`. */
export const LOGO_IDS: readonly string[] = Object.keys(LOGOS);

export function makeLogo(id: string): string | null {
  return LOGOS[id] ?? null;
}
