# ADR 0012 — Electron no aplicativo do Windows

**Status:** Aceito · 2026-09-17

## Contexto

O aplicativo do piloto precisa de três coisas ao mesmo tempo:

1. **Processo vivo com estado** — o watcher da pasta de telemetria, a fila de
   publicação e o banco local.
2. **Acesso nativo** — na fase 2, ler a memória compartilhada do iRacing exige
   um addon C++ **para Node** (`@irsdk-node/native`).
3. **Interface rica** — gráficos de volta com zoom, overlay e milhares de pontos.

E o projeto inteiro é TypeScript.

## Decisão

**Electron**, com `electron-vite`: processo principal em Node (composition root,
watcher, SQLite), preload como ponte restrita, renderer em React + Vite.

## Por quê

O que decide é o item 2. No Electron o processo principal *é* Node: o addon
nativo carrega, com custo conhecido (`electron-builder` rebuilda por versão).

No Tauri o núcleo é Rust. Para ler o SDK do iRacing seria preciso reescrever o
binding em Rust (existem as crates `iracing` e `itelem`) ou empurrar um sidecar
Node — três toolchains num projeto que decidiu ser TypeScript.

Some-se que o watcher precisa de vida longa e estado, e o processo principal do
Electron é exatamente isso.

## Segurança, que não é opcional aqui

O renderer roda com `contextIsolation: true`, `nodeIntegration: false` e
`sandbox: true`. Ele não tem `fs`, não tem rede direta e não tem chave de API: o
preload expõe apenas os canais declarados em `ipc-contract.ts`. Uma falha no
front não vira acesso ao disco do piloto.

## O que se aceita perder

- **~200 MB instalados** e o consumo de memória do Chromium.
- **Rebuild nativo por versão do Electron** — `better-sqlite3` hoje, o addon do
  SDK amanhã. É um custo pago uma vez e automatizado pelo `electron-builder`.
- **Superfície de segurança do Electron**, que exige disciplina (as três flags
  acima, e nada de `remote`).
- Atualização do app é responsabilidade nossa (auto-update do `electron-builder`).

## Sinal para reverter

Se a fase 2 não acontecer e o tamanho do instalador virar reclamação real de
usuário, Tauri v2 passa a valer: o renderer já é React + Vite, e o que mudaria é
o processo principal. A arquitetura hexagonal deixa isso como "outro composition
root", não como reescrita.
