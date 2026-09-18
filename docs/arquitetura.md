# Arquitetura

## O que este sistema faz

Lê os arquivos `.ibt` que o iRacing grava em disco, recorta as voltas, compara a
volta do piloto com uma referência e usa um agente de LLM para explicar onde e
por que o tempo foi perdido. E deixa o piloto compartilhar o que quiser com
outros pilotos.

## As três aplicações

```
  ┌─ apps/desktop (Electron, Windows) ───────────────┐
  │  watcher → .ibt → análise → LLM → interface      │  offline-first
  └──────────────┬───────────────────────────────────┘
                 │ publica (fila + retry) · baixa voltas · autentica
  ┌──────────────▼──────────────┐
  │  apps/cloud-api (NestJS)    │ ── Postgres
  └──────────────▲──────────────┘
                 │
  ┌──────────────┴──────────────┐
  │  apps/web (Next.js)         │  rede social, sem LLM
  └─────────────────────────────┘
```

**O desktop é o core.** Ele é a única origem de telemetria do sistema: lê o
`.ibt` que o iRacing grava e, na fase 2, falará com o SDK. A cloud-api recebe
dado **já processado**, guarda e devolve. A web só lê da cloud-api.

Quatro fronteiras, verificadas por `pnpm arch` (ADR 0011 e 0016):

1. **Só o desktop gera telemetria.** A nuvem não declara
   `@telemetry/application-desktop`, então não consegue nem nomear a ingestão; e
   não tem `node:fs` nos builtins, então não abre arquivo.
2. **O desktop nunca espera a nuvem.** Toda ida à cloud-api passa por porta e por
   fila com retry. Sem internet, o aplicativo funciona inteiro.
3. **A web nunca fala com a máquina do piloto.** Ela depende só de `contracts`.
4. **A LLM é só do desktop.** `adapter-llm` não entra na cloud-api nem na web.

Dentro do desktop, o front conversa com o processo principal por **IPC** — não
existe servidor HTTP em `localhost`.

## A forma

Ports & adapters (hexagonal), com a dependência apontando **para dentro**.
Decisão e justificativa em [ADR 0009](adr/0009-arquitetura-hexagonal.md).

```
      ┌──────────────────────────────────────────────────────┐
      │                       domain                         │  regras, zero deps
      │  voltas · séries · delta · condições · visibilidade   │
      └───────────────────────▲──────────────────────────────┘
                              │
      ┌───────────────────────┴──────────────────────────────┐
      │        application  (relógio · id · erro comum)       │
      └──────▲───────────────────────────────────▲───────────┘
             │                                   │
   ┌─────────┴──────────┐              ┌─────────┴──────────┐
   │ application-desktop│              │ application-cloud  │  casos de uso + PORTAS
   │ telemetria · voltas│              │ visibilidade       │  commands/ e queries/
   │ análise · publicar │              │ compartilhar · ler │
   └──▲────▲─────▲────▲─┘              └────▲──────────▲────┘
      │    │     │    │                     │          │
     ibt   fs  sqlite http · llm         postgres    memory
      └────┴─────┴────┴──┐                  └────┬─────┘
                         │                       │
              apps/desktop                apps/cloud-api ── apps/web
           (composition root)          (composition root)
```

Os dois lados nunca se veem: o desktop não declara `application-cloud`, a nuvem
não declara `application-desktop`. Cada um enxerga só o núcleo compartilhado —
é assim que "só o desktop gera telemetria" deixa de ser combinado (ADR 0016).

**A porta é declarada por quem a usa.** `application` diz "preciso de algo que
leia bytes"; `adapter-fs` obedece. É isso que inverte a dependência e faz trocar
biblioteca ser troca de arquivo, não refatoração.

## Onde cada coisa mora

| Pacote | Responsabilidade | Dependência externa que possui |
|---|---|---|
| `packages/domain` | modelo e regras de corrida | **nenhuma** |
| `packages/application` | núcleo: relógio, id, erro comum | **nenhuma** |
| `packages/application-desktop` | casos de uso de telemetria e análise | **nenhuma** |
| `packages/application-cloud` | casos de uso de publicação e acesso | **nenhuma** |
| `packages/contracts` | DTOs e validação da borda | `zod` |
| `packages/ibt-core` | decoder binário puro | **nenhuma** |
| `packages/adapter-ibt` | porta de decodificação | — (usa `ibt-core`) |
| `packages/adapter-fs` | arquivo e watcher | `node:fs`, `chokidar` |
| `packages/adapter-sqlite` | banco local do piloto | `better-sqlite3` |
| `packages/adapter-http` | cliente da cloud-api | — |
| `packages/adapter-postgres` | sessões publicadas | `pg` |
| `packages/adapter-llm` | porta do narrador | `ai`, `@ai-sdk/*` |
| `packages/adapter-memory` | portas em memória | **nenhuma** |
| `apps/desktop` | composition root + IPC + interface | `electron` |
| `apps/cloud-api` | composition root + HTTP | `@nestjs/*`, `iron-session` |
| `apps/web` | interface pública | `next`, `react` |

Cada adapter é **dono de uma dependência externa**. O AI SDK só existe dentro de
`adapter-llm`; `node:fs` só dentro de `adapter-fs`; `zod` só em `contracts`.

## O custo de trocar uma lib

É o teste real da arquitetura:

| Trocar | Muda | Não muda |
|---|---|---|
| decoder de `.ibt` | `adapter-ibt` | domínio, casos de uso, apps |
| Gemini → outro provedor | variável de ambiente | nada |
| AI SDK → Mastra | `adapter-llm` | tudo o mais |
| SQLite → outro banco local | `adapter-sqlite` | tudo o mais |
| Postgres → outro banco | `adapter-postgres` | tudo o mais |
| NestJS → outro framework | `apps/cloud-api/src/modules/` | domínio, casos de uso, adapters |
| Electron → Tauri | processo principal do desktop | domínio, casos de uso, adapters, renderer |
| zod → outra validação | `contracts` | todo o resto |
| iron-session → outro esquema | `adapter-http` + cloud-api | as portas e os casos de uso |
| arquivo → memória compartilhada (fase 2) | novo adapter de `TelemetryFilePort` | tudo o mais |

## CQS

Todo caso de uso é comando **ou** query. Ver [ADR 0010](adr/0010-cqs-na-aplicacao.md).

```
packages/application-{desktop,cloud}/src/
  commands/   mudam estado, devolvem no máximo um id     → POST
  queries/    não mudam nada, devolvem dados             → GET
  ports/      o que aquele lado exige do mundo externo
```

A separação é verificada pelo compilador, não por revisão: `SessionReaderPort` e
`SessionWriterPort` são interfaces diferentes, e uma query que só recebe o leitor
não tem como escrever.

## Testes como consequência da forma

| Camada | Como se testa | Precisa de |
|---|---|---|
| `domain` | chamada direta | nada |
| `application` | fake de porta escrito à mão | nada |
| adapters | **a suíte de contrato da porta** | nada (ou a lib do adapter) |
| `apps/desktop` | handlers de IPC com barramento falso | nada |

A suíte de contrato (`@telemetry/application-desktop/testing` e
`@telemetry/application-cloud/testing`) é o que dá sentido a
"substituível": toda implementação de uma porta roda os mesmos testes. O adapter
em memória passa hoje; o de disco terá que passar amanhã, sem que nenhum caso de
uso mude.

## Fronteiras verificadas por máquina

`pnpm arch` roda dentro do `pnpm check` e reprova:

1. dependência declarada fora do mapa de camadas;
2. import de pacote que o mapa não dá àquela camada — é o que impede a nuvem de
   tocar em `application-desktop`;
3. módulo `node:*` fora da lista daquele pacote — a cloud-api tem `node:crypto` e
   `node:http`, e **não** tem `node:fs`;
4. import de adapter fora do composition root;
5. import profundo (`@telemetry/x/src/...`) ou relativo saindo do pacote.

O mapa está em `scripts/architecture.config.mjs`. Mudar aquele arquivo é mudar a
arquitetura e pede ADR.

## Três decisões que sustentam o resto

### 1. O decoder é puro e a origem dos bytes é injetada

`ibt-core` não abre arquivo: recebe uma `ByteSource`. O `.ibt` e o stream ao vivo
usam o mesmo header e a mesma tabela de variáveis — muda só de onde vêm os bytes.
Na fase 2, isso é um adapter novo (ADR 0002).

### 2. A análise é determinística; o modelo só redige

Delta e tempo de volta saem do domínio, testável. O narrador recebe números
prontos. A conta fica certa, o custo cai e cada afirmação é rastreável até um
trecho e uns canais (ADR 0005, `docs/agente.md`).

### 3. O que roda local fica local por padrão

O watcher (ADR 0004) implica que a ingestão e a análise rodam na mesma máquina do
sim. O arquivo `.ibt` **nunca** sai dela.

O que sobe é o derivado — metadados, condições, voltas e séries — e sobe
automaticamente, mas **nasce privado**: aparecer para outra pessoa exige ação do
piloto no painel da web (ADR 0013). Além disso, o resumo numérico que vai no
prompt do narrador sai para o provedor de LLM escolhido, e só ele.

## Catálogo de canais em runtime

Nunca existe lista fixa de canais: o catálogo é montado percorrendo a tabela de
variáveis do arquivo, porque o conjunto muda entre carros e builds do sim.

A exceção é explícita e verificada: os poucos canais **obrigatórios** para
recortar voltas (`Lap`, `LapDistPct`) estão declarados em
`packages/application-desktop/src/commands/ingest-telemetry-file.command.ts` e são
conferidos contra o catálogo real do arquivo — ausência falha nomeando o canal,
em vez de produzir volta errada em silêncio.
