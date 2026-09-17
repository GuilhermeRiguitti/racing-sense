# Arquitetura

## O que este sistema faz

Lê os arquivos `.ibt` que o iRacing grava em disco, recorta as voltas, compara a
volta do piloto com uma volta de referência importada e usa um agente de LLM para
explicar onde e por que o tempo foi perdido.

## Fluxo

```
iRacing (Alt-L arma a telemetria)
  └─> %USERPROFILE%\Documents\iRacing\telemetry\*.ibt
        └─> @telemetry/ingest  — watcher: espera o arquivo destravar e estabilizar
              └─> @telemetry/ibt-core — decoder puro: header, tabela de variáveis, amostras
                    └─> @telemetry/analysis — voltas, séries por distância, delta vs. referência
                          ├─> @telemetry/api — HTTP local
                          │     ├─> @telemetry/web — gráficos
                          │     └─> @telemetry/agent — relatório em linguagem natural
                          └─> volta de referência importada (outro .ibt) entra aqui
```

## Onde cada coisa mora

| Pacote | Responsabilidade | Pode tocar em |
|---|---|---|
| `@telemetry/ibt-core` | Decodificar bytes do formato `.ibt` | nada além de `DataView`/`Uint8Array` |
| `@telemetry/ingest` | I/O de arquivo, watcher, file-lock, cache | `node:fs`, `chokidar` |
| `@telemetry/analysis` | Voltas, normalização, downsampling, delta | funções puras sobre dados decodificados |
| `@telemetry/contracts` | Schemas zod que cruzam processo | `zod` |
| `@telemetry/agent` | Ferramentas + LLM | `ai`, providers, `analysis` |
| `@telemetry/api` | HTTP local | tudo acima |
| `@telemetry/web` | Interface | só `contracts` e a API |

A dependência **nunca** aponta para trás: `ibt-core` não conhece `ingest`, `analysis`
não conhece `api`, `contracts` não conhece ninguém.

## As três decisões estruturais

### 1. O decoder é puro e a origem dos bytes é injetada

`@telemetry/ibt-core` não abre arquivo. Ele recebe uma `ByteSource` e pede
"me dê `n` bytes a partir de `x`". Hoje existe uma implementação sobre `node:fs`;
na fase 2 haverá uma sobre a memória compartilhada do sim.

Isso não é purismo. O `.ibt` e o stream ao vivo usam **o mesmo header e a mesma
tabela de variáveis** — a única diferença real é de onde vêm os bytes e o fato de o
arquivo ter 32 bytes extras de `DiskSubHeader`. Manter o decoder puro é o que
transforma a fase 2 em "escrever uma classe" em vez de "reescrever o parser".

### 2. A análise é determinística; o modelo só redige

O agente não calcula delta nem tempo de volta. Ele chama ferramentas que devolvem
números já calculados por `@telemetry/analysis` e escreve a explicação em cima.

Três razões: a conta fica certa e testável; o custo despenca (não se manda 100 mil
pontos por canal para o modelo); e o resultado é auditável — cada afirmação aponta
para um trecho e para os canais que a sustentam.

### 3. Tudo roda local

A escolha do watcher (ADR 0004) implica que a API roda na mesma máquina Windows
que o sim, porque é ela que enxerga a pasta de telemetria. O front consome uma API
em `localhost`. Nenhum dado de telemetria sai da máquina do piloto, exceto o resumo
numérico que vai no prompt do agente — e isso está documentado em `docs/agente.md`.

## Catálogo de canais em runtime

Nunca existe lista fixa de canais no código. O conjunto muda entre carros e entre
builds do sim. O catálogo é montado percorrendo a tabela de variáveis do arquivo,
e cada canal já vem com nome, tipo, unidade e `count` — o suficiente para gerar a
seleção de canais na UI dinamicamente.

Código que escreve `sample.get('Speed')` sem checar se o canal existe naquele
arquivo é bug esperando acontecer.

## O que a fase 2 vai mexer

Só `@telemetry/ingest` ganha uma `ByteSource` nova e o processo passa a rodar em
loop com congelamento de buffer (ver `docs/formato-ibt.md`, seção de memória
compartilhada). `ibt-core`, `analysis`, `contracts` e `agent` não mudam.
