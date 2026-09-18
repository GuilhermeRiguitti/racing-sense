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
pnpm check          # lint + arch + typecheck + testes

pnpm dev:desktop    # aplicativo do piloto (Electron)
pnpm dev:cloud      # cloud-api (NestJS), porta 4000
pnpm dev:web        # rede social (Next.js), porta 3000
```

Node 22+, pnpm 10+.

## Como funciona

```
iRacing (Alt-L) → .ibt em Documentos\iRacing\telemetry\
  → apps/desktop: watcher espera o arquivo destravar, decodifica,
    recorta voltas, compara com a referência e roda a análise por LLM
  → publica na fila (nasce privado) → apps/cloud-api → Postgres
  → apps/web: perfil, feed e voltas de outros pilotos
```

**O desktop é o produto** — o coach que o piloto deixa aberto enquanto treina.
Ele funciona inteiro **sem internet**, e é a única origem de telemetria do
sistema. A web e a cloud-api são funcionalidade extra, para compartilhar volta e
comparar com outros pilotos; que elas fiquem desatualizadas não é problema.

Ver [ADR 0011](docs/adr/0011-topologia-tres-aplicacoes.md),
[0016](docs/adr/0016-so-o-desktop-gera-telemetria.md) e
[0017](docs/adr/0017-desktop-e-o-produto.md).

## Estrutura

Ports & adapters: a dependência aponta para dentro, e `pnpm arch` reprova quem
furar. Ver [docs/arquitetura.md](docs/arquitetura.md).

```
domain ◀── application (portas) ◀── adapters ◀── composition root (desktop | cloud-api)
```

| Aplicação | O quê |
|---|---|
| [`apps/desktop`](apps/desktop) | Electron, roda no Windows do piloto. Offline-first, com LLM |
| [`apps/cloud-api`](apps/cloud-api) | NestJS + Postgres. A ponte entre desktop e web |
| [`apps/web`](apps/web) | Next.js. Rede social: perfil, feed, voltas de outros |

| Pacote | O quê |
|---|---|
| [`packages/domain`](packages/domain) | Modelo e regras de corrida. Zero dependências |
| [`packages/application`](packages/application) | Casos de uso (CQS) e as portas que eles exigem |
| [`packages/contracts`](packages/contracts) | DTOs e validação da borda. Único lugar com zod |
| [`packages/ibt-core`](packages/ibt-core) | Decoder binário puro do `.ibt` |
| [`packages/adapter-ibt`](packages/adapter-ibt) | Porta de decodificação sobre o `ibt-core` |
| [`packages/adapter-fs`](packages/adapter-fs) | Arquivo e watcher. Único dono de `node:fs` |
| [`packages/adapter-sqlite`](packages/adapter-sqlite) | Banco local do piloto |
| [`packages/adapter-http`](packages/adapter-http) | Cliente da cloud-api |
| [`packages/adapter-postgres`](packages/adapter-postgres) | Sessões publicadas no servidor |
| [`packages/adapter-llm`](packages/adapter-llm) | Porta do narrador. Único dono do AI SDK |
| [`packages/adapter-memory`](packages/adapter-memory) | Portas em memória, para teste |

Trocar uma biblioteca custa um pacote: decoder muda `adapter-ibt`, provedor de
LLM muda `adapter-llm`, banco local muda `adapter-sqlite`. Nenhum caso de uso é
tocado.

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

**No MVP:** ler `.ibt` em disco, recortar voltas, comparar com referência,
gráficos e relatório do agente no desktop; publicar e compartilhar na web.

**Fase 2:** telemetria ao vivo via memória compartilhada. Não implementar agora — a
arquitetura já deixa o caminho pronto (ver [ADR 0002](docs/adr/0002-mvp-le-arquivo-em-disco.md)).
