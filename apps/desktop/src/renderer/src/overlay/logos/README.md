# Logos dos fabricantes

Um arquivo por fabricante, com o nome igual ao `id` da lista `MAKES` em
`apps/desktop/src/main/domain/driver.ts`: `ferrari.png`, `mercedes-amg.png`,
`alfa-romeo.png`. Fabricante sem arquivo aparece no overlay com a sigla.

- PNG ou SVG. PNG com no máximo 192 × 96 px, recortado sem margem transparente:
  o overlay desenha a logo em 40 × 18 px, e arquivo grande só pesa no instalador.
  SVG exportado do Figma com imagem embutida é PNG disfarçado — extraia o PNG.
- A logo vai num chip claro (`.ov-make-logo` em `overlay.css`), então a versão
  colorida original serve; não precisa da versão branca.
- Só fabricante que existe no iRacing. Logo sem `id` na lista quebra o teste
  `make-logo.test.ts` — o arquivo seria ignorado em silêncio.
- Não copie do site do iRacing: são assets dele (ADR 0026).

Faltam: `dallara`, `oreca`, `riley`, `williams`. A de `radical` é da revenda
"Radical Northwest", não da fábrica — trocar quando houver a oficial.
