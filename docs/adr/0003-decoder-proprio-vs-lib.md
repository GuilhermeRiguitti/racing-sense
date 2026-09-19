# ADR 0003 — Decoder próprio como default, `ibt-telemetry` como validação cruzada

**Status:** Aceito · 2026-09-17 · confirmado em 2026-09-19 com arquivo real

## Contexto

Existe uma lib Node madura para ler `.ibt`: `ibt-telemetry` (v1.1.1, JS puro, com
streaming, referência da comunidade — a crate Rust `itelem` foi escrita com base nela).
A última publicação é de junho de 2022.

O projeto também precisa que o decoder funcione com uma `ByteSource` injetada, para a
fase 2 — coisa que a lib não oferece: ela lê de arquivo.

## Decisão

Escrever o decoder no `@telemetry/ibt-core` e usar `ibt-telemetry` como **oráculo de
teste**: rodar os dois sobre o mesmo arquivo e comparar header, catálogo de canais e
uma amostragem de valores.

A decisão só seria aceita depois da etapa 1 do roadmap — com um arquivo real na mão.
**Foi.** Ver "Como ficou", abaixo.

## Por quê

- A spec cabe em ~200 linhas de TypeScript (ver `docs/formato-ibt.md`). Não é um
  formato que justifique dependência abandonada no caminho crítico.
- A abstração `ByteSource`, que é o que viabiliza a fase 2, exigiria fork de qualquer
  jeito.
- Como oráculo, a lib vale muito: divergência entre as duas implementações aponta bug
  em uma das duas, e isso é mais barato que descobrir pelo gráfico torto.

## O que se aceita perder

Manutenção do decoder é nossa. Mitigação: o formato é estável há anos e os testes de
consistência já existem.

## Sinal para reverter

Se o decoder próprio divergir do `ibt-telemetry` em pontos que não conseguimos explicar
pela spec, a resposta certa é adotar a lib (ou seu fork) e manter só a `ByteSource`.

## Como ficou (2026-09-19)

O decoder próprio leu quatro arquivos reais de Ferrari 296 GT3 em Road Atlanta na
primeira tentativa. Três conferências independentes fecharam:

- `bufOffset + recordCount × bufLen` deu o tamanho exato do arquivo;
- a soma dos tamanhos dos 288 canais deu exatamente `bufLen` (1108 bytes);
- o tempo de volta que recortamos das amostras bateu com o `LapLastLapTime` que o
  próprio sim gravou (105,5 s contra 1:45,466).

Isso torna o `ibt-telemetry` desnecessário como etapa: ele fica como **ferramenta
de diagnóstico** se um dia aparecer divergência que a spec não explique, não como
dependência nem como parte da suíte. O "sinal para reverter" continua valendo.
