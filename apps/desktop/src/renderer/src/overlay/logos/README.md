# Logos dos fabricantes

Um SVG por fabricante, com o nome igual ao `id` da lista `MAKES` em
`apps/desktop/src/main/domain/driver.ts`: `ferrari.svg`, `mercedes-amg.svg`,
`alfa-romeo.svg`. Fabricante sem arquivo aparece no overlay com a sigla.

- Prefira SVG com licença clara (Simple Icons, CC0) ou o da página de imprensa do
  fabricante. Não copie do site do iRacing: são assets dele (ADR 0026).
- O overlay desenha a logo em 34 × 16 px sobre fundo escuro: logo preta some.
  Use a versão clara ou monocromática branca.
- Arquivo que não bate com um `id` é ignorado em silêncio — confira o nome.
