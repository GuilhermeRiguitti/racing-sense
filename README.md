# telemetry-analysis

Análise agêntica de telemetria do iRacing. Lê os arquivos `.ibt` que o sim grava em
disco, recorta as voltas, compara com uma volta de referência e usa um agente de LLM
para explicar onde o tempo foi perdido.

> **Estado: fundação.** A estrutura, a documentação e as regras estão de pé; o decoder
> tem tipos, constantes de formato e testes de consistência. A decodificação de um
> arquivo real ainda não foi validada — é a etapa 1 do [roadmap](docs/roadmap.md).

## Começando

```bash
pnpm install
pnpm check        # lint + typecheck + testes
```

Node 22+, pnpm 10+.

## Como funciona

```
iRacing (Alt-L) → .ibt em Documentos\iRacing\telemetry\
  → watcher local espera o arquivo destravar
  → decoder puro lê header, catálogo de canais e amostras
  → análise recorta voltas e compara com a volta de referência
  → API local → gráficos na web + relatório do agente
```

Detalhes em [docs/arquitetura.md](docs/arquitetura.md).

## Estrutura

| Pacote | O quê |
|---|---|
| [`packages/ibt-core`](packages/ibt-core) | Decoder puro do formato `.ibt`. Sem I/O, sem dependências |
| [`packages/ingest`](packages/ingest) | Leitura de arquivo, watcher, file-lock do Windows |
| [`packages/analysis`](packages/analysis) | Voltas, séries por distância, delta contra a referência |
| [`packages/contracts`](packages/contracts) | Schemas zod compartilhados |
| [`packages/agent`](packages/agent) | Ferramentas + LLM que redige a análise |
| [`apps/api`](apps/api) | API HTTP local |
| [`apps/web`](apps/web) | Interface (Next.js) |

## Documentação

| Documento | Para quê |
|---|---|
| [Arquitetura](docs/arquitetura.md) | como as peças se encaixam e por quê |
| [Formato `.ibt`](docs/formato-ibt.md) | o layout binário, campo a campo |
| [Camada agêntica](docs/agente.md) | o que o agente faz e o que ele não faz |
| [Roadmap](docs/roadmap.md) | etapas e critério de pronto de cada uma |
| [Pendências](docs/pendencias.md) | o que ainda não foi decidido ou validado |
| [ADRs](docs/adr/) | decisões estruturais e o que se aceitou perder |
| [Glossário](docs/glossario.md) | termos de telemetria de corrida |
| [Fixtures](docs/fixtures.md) | como obter um `.ibt` para desenvolvimento |
| [Referências](docs/referencias.md) | spec, libs e projetos de referência |
| [Como contribuir](CONTRIBUTING.md) | ambiente, regras, commits |

Agentes de código começam pelo [`CLAUDE.md`](CLAUDE.md).

## Escopo

**No MVP:** ler `.ibt` em disco, recortar voltas, comparar com referência importada,
gráficos e relatório do agente.

**Fase 2:** telemetria ao vivo via memória compartilhada. Não implementar agora — a
arquitetura já deixa o caminho pronto (ver [ADR 0002](docs/adr/0002-mvp-le-arquivo-em-disco.md)).
