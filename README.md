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
pnpm check        # lint + arch + typecheck + testes
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

Ports & adapters: a dependência aponta para dentro, e `pnpm arch` reprova quem
furar. Ver [docs/arquitetura.md](docs/arquitetura.md).

```
domain  ◀── application (portas) ◀── adapters ◀── apps/api (composition root)
```

| Pacote | O quê |
|---|---|
| [`packages/domain`](packages/domain) | Modelo e regras de corrida. Zero dependências |
| [`packages/application`](packages/application) | Casos de uso (CQS) e as portas que eles exigem |
| [`packages/contracts`](packages/contracts) | DTOs da borda HTTP. Único lugar com zod |
| [`packages/ibt-core`](packages/ibt-core) | Decoder binário puro do `.ibt` |
| [`packages/adapter-ibt`](packages/adapter-ibt) | Porta de decodificação sobre o `ibt-core` |
| [`packages/adapter-fs`](packages/adapter-fs) | Arquivo, watcher e persistência. Único dono de `node:fs` |
| [`packages/adapter-llm`](packages/adapter-llm) | Porta do narrador. Único dono do AI SDK |
| [`packages/adapter-memory`](packages/adapter-memory) | Portas em memória, para teste e desenvolvimento |
| [`apps/api`](apps/api) | Composition root + HTTP local |
| [`apps/web`](apps/web) | Interface (Next.js) |

O custo de trocar uma biblioteca é conhecido e local: decoder muda `adapter-ibt`,
provedor de LLM muda `adapter-llm`, persistência muda `adapter-fs`. Nenhum caso de
uso é tocado.

## Documentação

| Documento | Para quê |
|---|---|
| [Arquitetura](docs/arquitetura.md) | as camadas, o custo de trocar cada lib, como testar |
| [ADR 0009](docs/adr/0009-arquitetura-hexagonal.md) | por que ports & adapters, e o que se aceitou perder |
| [ADR 0010](docs/adr/0010-cqs-na-aplicacao.md) | a regra de comando vs. query |
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
