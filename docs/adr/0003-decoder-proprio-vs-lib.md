# ADR 0003 — Decoder próprio como default, `ibt-telemetry` como validação cruzada

**Status:** Proposto · 2026-09-17

## Contexto

Existe uma lib Node madura para ler `.ibt`: `ibt-telemetry` (v1.1.1, JS puro, com
streaming, referência da comunidade — a crate Rust `itelem` foi escrita com base nela).
A última publicação é de junho de 2022.

O projeto também precisa que o decoder funcione com uma `ByteSource` injetada, para a
fase 2 — coisa que a lib não oferece: ela lê de arquivo.

## Decisão proposta

Escrever o decoder no `@telemetry/ibt-core` e usar `ibt-telemetry` como **oráculo de
teste**: rodar os dois sobre o mesmo arquivo e comparar header, catálogo de canais e
uma amostragem de valores.

A decisão só é aceita depois da etapa 1 do roadmap — com um arquivo real na mão.

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
