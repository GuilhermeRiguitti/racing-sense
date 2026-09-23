# Referências

## Oficiais

- [Guia de telemetria em disco (PDF da iRacing)](https://ir-core-sites.iracing.com/members/atlas/atlas_quickstart.pdf) — explica o `Alt-L` e a pasta de telemetria
- [SDK C++ oficial (`irsdk.h`)](https://forums.iracing.com/discussion/62/iracing-sdk) — fórum, exige assinatura ativa

## Spec do formato (engenharia reversa da comunidade)

A iRacing não publica a descrição do formato binário. Estas são as melhores
referências escritas:

- [crate `itelem` (Rust)](https://docs.rs/crate/itelem/latest) — a referência mais limpa do `.ibt`, com tamanhos de header e structs
- [crate `iracing` (Rust)](https://docs.rs/crate/iracing/latest) — melhor explicação do layout da memória compartilhada
- [`goiracing` (Go)](https://pkg.go.dev/github.com/margic/goiracing) — formato do header de variável
- [Wiki não-oficial do SDK/API](https://iracingsdk.fandom.com/wiki/IRacing_SDK_and_API_Documentation_Wiki)

## Projetos de referência (Node/TS)

- [`ibt-telemetry`](https://github.com/SkippyZA/ibt-telemetry) — parser JS puro, com streaming. Última publicação em 2022
- [`iracing-telemetry-analyzer`](https://github.com/PulsePanda/iracing-telemetry-analyzer) — app completo com parser, watcher, cache e gráficos. Melhor referência de arquitetura, especialmente o `watcher.js`
- [`TRACE.IT`](https://github.com/naizens/TRACE.IT) — analisador de `.ibt` em TypeScript
- [`iracing-ibt-parser`](https://github.com/matthias-hampel/iracing-ibt-parser) — exemplo mínimo em TS
- [`pyirsdk`](https://github.com/kutu/pyirsdk) — referência de facto da comunidade (Python)

## Fase 2 — telemetria ao vivo

- [`irsdk-node`](https://www.npmjs.com/package/irsdk-node)
- [`@irsdk-node/native`](https://www.npmjs.com/package/@irsdk-node/native)
- [`emilioSp/node-iracing-sdk`](https://github.com/emilioSp/node-iracing-sdk)

## Stack

- [AI SDK (Vercel)](https://ai-sdk.dev)
- [Mastra](https://mastra.ai) — alternativa avaliada no ADR 0005
- [Electron](https://electronjs.org) · [electron-vite](https://electron-vite.org) · [electron-builder](https://electron.build)
- [NestJS](https://nestjs.com)
- [Next.js](https://nextjs.org)
- [iron-session](https://github.com/vvo/iron-session)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [Biome](https://biomejs.dev)
