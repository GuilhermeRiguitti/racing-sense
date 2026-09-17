# Arquitetura

## O que este sistema faz

Lê os arquivos `.ibt` que o iRacing grava em disco, recorta as voltas, compara a
volta do piloto com uma volta de referência e usa um agente de LLM para explicar
onde e por que o tempo foi perdido.

## A forma

Ports & adapters (hexagonal), com a dependência apontando **para dentro**.
Decisão e justificativa em [ADR 0009](adr/0009-arquitetura-hexagonal.md).

```
        ┌─────────────────────────────────────────────┐
        │                  domain                     │  regras, zero deps
        │   voltas · séries · delta · compatibilidade  │
        └────────────────────▲────────────────────────┘
                             │
        ┌────────────────────┴────────────────────────┐
        │               application                   │  casos de uso + PORTAS
        │   commands/ (escrevem)  queries/ (leem)      │
        └────▲───────────▲───────────▲───────────▲────┘
             │           │           │           │        (as setas apontam
     adapter-ibt   adapter-fs  adapter-llm  adapter-memory  para dentro: quem
     decoder .ibt   node:fs      AI SDK       teste/dev      implementa depende
                                                             de quem declara)
                             ▲
                    apps/api (composition root)  ── apps/web
```

**A porta é declarada por quem a usa.** `application` diz "preciso de algo que
leia bytes"; `adapter-fs` obedece. É isso que inverte a dependência e faz trocar
biblioteca ser troca de arquivo, não refatoração.

## Onde cada coisa mora

| Pacote | Responsabilidade | Pode depender de |
|---|---|---|
| `packages/domain` | modelo e regras de corrida | **nada** |
| `packages/application` | casos de uso e portas | `domain` |
| `packages/contracts` | DTOs da borda HTTP | `domain`, `zod` |
| `packages/ibt-core` | decoder binário puro | **nada** |
| `packages/adapter-ibt` | porta de decodificação via `ibt-core` | `application`, `domain`, `ibt-core` |
| `packages/adapter-fs` | arquivo, watcher, persistência | + `node:fs`, `chokidar` |
| `packages/adapter-llm` | porta do narrador | + `ai`, `@ai-sdk/*` |
| `packages/adapter-memory` | portas em memória (teste e dev) | `application`, `domain` |
| `apps/api` | composition root + HTTP | tudo acima, `hono` |
| `apps/web` | interface | `contracts`, `next` |

Cada adapter é **dono de uma dependência externa**. O AI SDK só existe dentro de
`adapter-llm`; `node:fs` só dentro de `adapter-fs`; `zod` só em `contracts`.

## O custo de trocar uma lib

É o teste real da arquitetura:

| Trocar | Muda | Não muda |
|---|---|---|
| decoder de `.ibt` | `adapter-ibt` | domínio, casos de uso, API, front |
| Gemini → outro provedor | variável de ambiente | nada |
| AI SDK → Mastra | `adapter-llm` | tudo o mais |
| memória → SQLite | `adapter-fs` | tudo o mais |
| Hono → outro framework | `apps/api/src/http/` | domínio, casos de uso, adapters |
| zod → outra validação | `contracts` | domínio, casos de uso, adapters |
| arquivo → memória compartilhada (fase 2) | novo adapter de `TelemetryFilePort` | tudo o mais |

## CQS

Todo caso de uso é comando **ou** query. Ver [ADR 0010](adr/0010-cqs-na-aplicacao.md).

```
packages/application/src/
  commands/   mudam estado, devolvem no máximo um id     → POST
  queries/    não mudam nada, devolvem dados             → GET
  ports/      o que a aplicação exige do mundo externo
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
| `apps/api` | `app.request()` em memória | nada |

A suíte de contrato (`@telemetry/application/testing`) é o que dá sentido a
"substituível": toda implementação de uma porta roda os mesmos testes. O adapter
em memória passa hoje; o de disco terá que passar amanhã, sem que nenhum caso de
uso mude.

## Fronteiras verificadas por máquina

`pnpm arch` roda dentro do `pnpm check` e reprova:

1. dependência declarada fora do mapa de camadas;
2. `node:*` em pacote que deve ser puro;
3. import de adapter fora do composition root;
4. import profundo (`@telemetry/x/src/...`) ou relativo saindo do pacote.

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

### 3. Tudo roda local

O watcher (ADR 0004) implica API na mesma máquina do sim. Nenhum dado de
telemetria sai da máquina, exceto o resumo numérico que vai no prompt.

## Catálogo de canais em runtime

Nunca existe lista fixa de canais: o catálogo é montado percorrendo a tabela de
variáveis do arquivo, porque o conjunto muda entre carros e builds do sim.

A exceção é explícita e verificada: os poucos canais **obrigatórios** para
recortar voltas (`Lap`, `LapDistPct`) estão declarados em
`packages/application/src/commands/ingest-telemetry-file.command.ts` e são
conferidos contra o catálogo real do arquivo — ausência falha nomeando o canal,
em vez de produzir volta errada em silêncio.
