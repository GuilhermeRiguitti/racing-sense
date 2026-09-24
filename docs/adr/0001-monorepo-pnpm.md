# ADR 0001 — Monorepo pnpm com pacotes em TypeScript

**Status:** Aceito · 2026-09-17 · **Superado em parte por ADR 0020** (o monorepo pnpm continua; pacotes compartilhados em TypeScript cru e `catalog:` saíram)
**Refinado por:** ADR 0009 (o mapa de pacotes abaixo foi substituído pelas camadas)

## Contexto

O projeto tem partes com ciclos de vida bem diferentes: um decoder binário que quase
não muda, uma camada de análise que muda toda semana, um agente de LLM e uma interface.
A fase 2 (telemetria ao vivo) vai trocar só a origem dos bytes.

## Decisão

Monorepo pnpm com `packages/*` e `apps/*`. Os pacotes internos são consumidos **como
código-fonte TypeScript** (`exports` apontando para `./src/index.ts`), sem build step.

Versões de dependências compartilhadas vivem no `catalog:` do `pnpm-workspace.yaml`.

## Por quê

- A fronteira entre pacotes vira regra executável: `@telemetry/ibt-core` não declara
  `node:fs` como dependência, então não tem como importar acidentalmente. Numa pasta
  única, essa regra seria só um comentário.
- Sem build step, não existe passo "esqueci de compilar antes de testar". `tsx`,
  `vitest` e o Next transpilam direto.
- O catálogo evita o clássico de três pacotes com três versões de `zod` e um erro de
  tipo incompreensível.

## O que se aceita perder

- Consumidor externo precisaria de build. Como nada aqui é publicado no npm, o custo é
  zero hoje — e vira um `tsdown` no dia em que deixar de ser.
- O Next precisa de `transpilePackages` para os pacotes internos.
- Mais arquivos de configuração que uma pasta `src/` única.

## Alternativa descartada

**Pacote único com módulos internos.** Mais simples agora, mas a regra "o decoder não
faz I/O" — que é o que viabiliza a fase 2 — não teria como ser aplicada por ninguém
além da disciplina de quem escreve.
