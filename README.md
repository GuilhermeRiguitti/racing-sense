# telemetry-analysis

Análise agêntica de telemetria do iRacing. Lê os arquivos `.ibt` que o sim grava em
disco, recorta as voltas, compara com uma volta de referência e usa um agente de LLM
para explicar onde o tempo foi perdido. Também mostra a volta ao vivo e desenha um
overlay por cima do sim enquanto o piloto treina.

> **Estado: o decoder lê arquivo real.** A estrutura, a documentação e as regras estão
> de pé, e desde 2026-09-19 o decoder abre um `.ibt` de verdade de ponta a ponta —
> pista, carro, condições, catálogo de canais e amostras em streaming, com os offsets
> conferidos contra oito arquivos. Recorte de voltas, persistência em SQLite, a
> primeira tela e o delta contra a referência estão de pé (etapas 1 a 3 do
> [roadmap](docs/roadmap.md), com a segmentação por setor). A leitura ao vivo e o
> overlay já existem; o que ainda é stub é o narrador.

## Começando

```bash
pnpm install
pnpm check          # lint + typecheck + testes das três aplicações

pnpm dev:desktop    # aplicativo do piloto (Electron)
pnpm dev:api        # api (NestJS), porta 4000 — Swagger em /docs
pnpm dev:web        # rede social (Next.js), porta 3000
```

Node 22+, pnpm 10.33.

## Funcionalidades

**Análise (a partir do `.ibt`)**

- Decoder de `.ibt` real: header, session info, catálogo de canais em runtime e
  amostras em streaming.
- Recorte de voltas, reamostragem por distância e validade da volta (completa, sem
  box e sem corte de pista).
- Tela de análise: sessões, voltas, sessão volta a volta (tempo, pressão,
  temperatura, combustível, ajustes) e a volta em abas (pilotagem, pneus,
  suspensão, carro) com delta contra a referência e cursor sincronizado.
- Segmentação por setor: tempo por volta, ganho ou perda contra a referência e
  volta ideal.

**Ao vivo**

- Leitura da memória compartilhada do SDK do iRacing, **somente leitura**
  ([ADR 0023](docs/adr/0023-leitura-ao-vivo-pela-memoria-compartilhada.md)).
- Tela "Ao vivo": a volta em curso se desenhando sobre a anterior, e cada canal.

**Overlay** ([ADR 0025](docs/adr/0025-overlay-em-janelas-proprias.md))

- Janelas próprias do Electron, transparentes e sempre por cima do sim; travadas,
  não pegam foco nem mouse. Nada é desenhado dentro do sim.
- Widgets: relative, classificação (marca, modelo, carteira, SR, iRating, SOF),
  delta, pedais, combustível, radar e bandeira.
- Modo mover: destrava pela tela "Overlay", arrasta, escolhe a escala e grava a
  posição ao travar.
- Números do sim sempre que o sim os entrega; dado do grid aparece só na tela do
  piloto, nunca é gravado nem publicado.
- Ainda não conferido contra o sim numa sessão completa
  ([pendências](docs/pendencias.md), item 15).

**Nuvem (opcional)**

- Cadastro, login, publicação (sessão nasce privada), visibilidade e links na api;
  perfil e feed na web.

## Como funciona

```
iRacing (Alt-L) → .ibt em Documentos\iRacing\telemetry\
  → apps/desktop: watcher espera o arquivo destravar, decodifica,
    recorta voltas, compara com a referência e roda a análise por LLM
  → publica na fila (nasce privado) → apps/api → Postgres
  → apps/web: perfil, feed e voltas de outros pilotos
```

**O desktop é o produto** — o coach que o piloto deixa aberto enquanto treina.
Ele funciona inteiro **sem internet**, e é a única origem de telemetria do
sistema. A web e a api são funcionalidade extra, para compartilhar volta e
comparar com outros pilotos; que elas fiquem desatualizadas não é problema.

Ver [ADR 0011](docs/adr/0011-topologia-tres-aplicacoes.md),
[0016](docs/adr/0016-so-o-desktop-gera-telemetria.md) e
[0017](docs/adr/0017-desktop-e-o-produto.md).

## Estrutura

Três aplicações **independentes**: cada uma tem o próprio `package.json`,
lockfile, `node_modules` e `tsconfig`, e nenhuma importa código da outra. O
contrato entre elas é o OpenAPI da api (`apps/api/openapi.json`), de onde
desktop e web geram os próprios tipos. Ver [ADR 0020](docs/adr/0020-aplicacoes-independentes.md)
e [docs/arquitetura.md](docs/arquitetura.md).

| Aplicação | O quê |
|---|---|
| [`apps/desktop`](apps/desktop) | Electron + SQLite, no Windows do piloto. Decoder, análise e LLM locais, sem HTTP |
| [`apps/api`](apps/api) | NestJS + Prisma + Postgres. Login, sessões publicadas, visibilidade, links. Swagger em `/docs` |
| [`apps/web`](apps/web) | Next.js. Rede social: perfil, feed, voltas de outros. Fala só com a api |

Quando a api mudar de contrato: `pnpm api:types` na raiz regenera os tipos no
desktop e na web.

## Documentação

| Documento | Para quê |
|---|---|
| [Arquitetura](docs/arquitetura.md) | as três aplicações, o contrato OpenAPI, como testar |
| [ADR 0020](docs/adr/0020-aplicacoes-independentes.md) | por que não há código compartilhado, e o que se aceitou perder |
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

**Fase 2, em andamento:** telemetria ao vivo via memória compartilhada e overlay,
só para visualizar — nada do ao vivo vai para o banco; a análise continua saindo do
`.ibt` ([ADR 0023](docs/adr/0023-leitura-ao-vivo-pela-memoria-compartilhada.md),
[0025](docs/adr/0025-overlay-em-janelas-proprias.md)). A transmissão para o
engenheiro em outra máquina está decidida no
[ADR 0024](docs/adr/0024-relay-ao-vivo-do-piloto-para-o-engenheiro.md).

**Fora do produto:** qualquer comando para o sim — broadcast, tecla simulada,
ajuste automático ([ADR 0022](docs/adr/0022-o-app-so-le-do-iracing.md)).
