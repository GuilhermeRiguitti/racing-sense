# ADR 0004 — Ingestão por watcher local

**Status:** Aceito · 2026-09-17

## Contexto

Duas formas de o arquivo chegar ao sistema: o usuário faz upload manual, ou um processo
local observa `Documentos\iRacing\telemetry\` e ingere sozinho.

O documento de referência inicial recomendava upload, por ser mais simples de hospedar.

## Decisão

Watcher local. O sistema roda na máquina do piloto, junto com o sim.

## Por quê

O produto é análise pós-sessão de quem acabou de sair do carro. Pedir que o piloto
localize um arquivo com nome gerado numa pasta do Documentos e faça upload, a cada
entrada no carro, é fricção que mata o uso — e são vários arquivos por noite de treino.

Como o watcher precisa rodar onde o sim roda, a API também roda local. Isso simplifica
outra coisa: nenhum dado de telemetria sai da máquina.

## O que se aceita perder

- **File-lock do Windows.** Enquanto a sessão roda, o sim mantém o arquivo aberto e
  travado. A estratégia (espera de estabilização + backoff + quarentena por timeout)
  está em `packages/adapter-fs/src/telemetry-watcher.fs.ts`. O `watcher.js` do
  `iracing-telemetry-analyzer` resolve exatamente esse problema e é a referência.
- **Arquivo incompleto.** Ler cedo demais dá header válido e amostras truncadas — pior
  que erro, porque passa. Por isso a validação de `recordCount` contra o tamanho real
  do arquivo é obrigatória na ingestão.
- Hospedar como serviço web deixa de ser trivial.

## Consequência

A `ByteSource` continua sendo a fronteira: se um dia entrar upload, muda só quem
constrói a `ByteSource`. O caminho de volta está aberto.
