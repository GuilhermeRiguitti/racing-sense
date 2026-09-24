# ADR 0009 — Arquitetura hexagonal com dependências invertidas

**Status:** Superado por ADR 0020 · 2026-09-17
**Refina:** ADR 0001 (monorepo pnpm), que continua valendo
**Refinado por:** ADR 0011 — as camadas seguem valendo; o que mudou é que hoje
existem dois composition roots (`apps/desktop` e `apps/cloud-api`) no lugar do
`apps/api` citado abaixo

## Contexto

O projeto depende de coisas que vão mudar: uma lib de parse de `.ibt` parada há
quatro anos, um provedor de LLM cujo preço e nome de modelo mudam a cada
trimestre, uma persistência ainda não escolhida (ADR 0007) e um segundo modo de
leitura já previsto (telemetria ao vivo, ADR 0002).

Na estrutura anterior, cada pacote conhecia a lib que usava e os casos de uso não
existiam como código: viviam implícitos nos handlers HTTP. Trocar o decoder, o
provedor ou o armazenamento significaria varrer o repositório inteiro.

## Decisão

Ports & adapters, com a regra de dependência apontando **para dentro**:

```
                       ┌───────────────────────┐
  adapters ──────────▶ │  application (portas) │ ──────▶ domain
  (fs, ibt, llm, mem)  └───────────────────────┘
                                  ▲
                          apps/api (composition root)
```

- **`domain`** — modelo e regras. Zero dependências, zero I/O.
- **`application`** — casos de uso e as **portas** que eles exigem. Depende só do domínio.
- **adapters** — implementam as portas. Cada um é dono de uma dependência externa:
  `adapter-fs` do `node:fs`, `adapter-llm` do AI SDK, `adapter-ibt` do decoder.
- **`contracts`** — DTOs da borda HTTP. Único lugar com `zod`.
- **`apps/api`** — o único arquivo que escolhe implementações é o composition root.

A porta é declarada por **quem a usa** (a aplicação), não por quem a implementa.
É isso que inverte a dependência: o adapter é que depende da aplicação.

## Por quê

O custo de trocar uma lib passa a ser conhecido e local:

| Trocar | Muda | Não muda |
|---|---|---|
| decoder de `.ibt` | `adapter-ibt` | domínio, casos de uso, API, front |
| provedor de LLM | `adapter-llm` | tudo o mais |
| memória → disco | `adapter-fs` | tudo o mais |
| Hono por outro framework | `apps/api/src/http` | domínio, casos de uso, adapters |
| zod por outra validação | `contracts` | domínio, casos de uso, adapters |

O segundo ganho é teste: caso de uso se testa com fake escrito à mão em três
linhas, sem disco, sem rede e sem chave de API. A suíte inteira roda em menos de
um segundo, e isso continua verdade quando o sistema crescer.

## SOLID, onde cada letra aparece

- **S** — um pacote, uma razão para mudar. `adapter-fs` muda quando o I/O muda;
  `domain` muda quando a regra de corrida muda.
- **O** — ler telemetria de outra origem é escrever um adapter novo; nenhum caso
  de uso é editado.
- **L** — toda implementação de porta roda a **mesma suíte de contrato**
  (`@telemetry/application/testing`). Passar nela é a definição operacional de
  "pode substituir".
- **I** — portas estreitas e leitura separada de escrita
  (`SessionReaderPort` / `SessionWriterPort`), para ninguém depender de método que
  não usa.
- **D** — todo mundo depende de interface; só o composition root conhece classe
  concreta.

## Como a regra se sustenta sem lembrete

`pnpm arch` (em `scripts/check-architecture.mjs`, dentro do `pnpm check`) reprova:

1. dependência declarada fora do mapa de camadas;
2. `node:*` em pacote que deve ser puro;
3. import de adapter fora do composition root;
4. import profundo (`@telemetry/x/src/...`) ou relativo saindo do pacote.

O mapa está em `scripts/architecture.config.mjs`. Mudar aquele arquivo é mudar a
arquitetura — e pede ADR novo.

## O que se aceita perder

- **Mais arquivos e mais indireção.** Uma leitura simples passa por porta,
  adapter e mapper. Para um CRUD isso seria peso morto; aqui o que se compra é a
  troca de dependência sem refatoração, que é justamente o requisito.
- **Um mapeamento a mais por fronteira.** `VarHeader` → `ChannelDescriptor` →
  DTO. É o preço de o vocabulário da lib não subir para o caso de uso.
- **Curva de entrada.** Quem chega precisa saber onde as coisas vão. Mitigação:
  `docs/arquitetura.md`, a skill `novo-caso-de-uso` e o `pnpm arch` dizendo o que
  está errado.

## Alternativa descartada

**Camadas por convenção, sem verificação.** Documentar e confiar na revisão. É o
que a estrutura anterior fazia na prática, e a primeira pressa desfaz. Regra de
arquitetura que não quebra o build vira comentário histórico.

## Sinal para reverter

Se, depois de três meses, nenhuma porta tiver mais de uma implementação real e
nenhuma troca de lib tiver acontecido, a indireção está cobrando sem entregar —
e aí vale colapsar adapters em módulos internos.
