# ADR 0011 — Três aplicações e a fronteira de autonomia

**Status:** Aceito · 2026-09-17
**Refina:** ADR 0004 (watcher local), ADR 0009 (hexagonal)
**Refinado por:** ADR 0016, que transforma "a análise mora no desktop" de
convenção em barreira de compilação

## Contexto

O produto tem dois públicos com necessidades opostas.

O piloto, na máquina dele, precisa de um aplicativo que funcione **enquanto ele
treina** — muitas vezes sem internet confiável, e que precise falar com o
simulador (hoje lendo `.ibt`, na fase 2 lendo memória compartilhada por addon
nativo).

A comunidade precisa de uma coisa pública, multiusuário, com perfil, feed e link
que abra no navegador de qualquer um.

Uma aplicação só teria que ser as duas, e o resultado previsível é: ou o app do
piloto passa a exigir internet, ou a web passa a depender de uma máquina
Windows ligada.

## Decisão

Três aplicações no mesmo monorepo:

| App | Framework | Onde roda | Papel |
|---|---|---|---|
| `apps/desktop` | Electron | Windows do piloto | ingestão, análise, LLM. **Offline-first** |
| `apps/cloud-api` | NestJS + Postgres | servidor | a ponte; guarda o que foi publicado |
| `apps/web` | Next.js | navegador | rede social: perfil, feed, voltas de outros |

Com três regras de fronteira, verificadas por `pnpm arch`:

1. **O desktop nunca espera a nuvem.** Toda comunicação com a cloud-api passa
   por porta (`SessionPublisherPort`, `CloudCatalogPort`, `IdentityPort`) e por
   fila com retry. Sem internet, o aplicativo inteiro funciona — só descobrir
   voltas dos outros atrasa.
2. **A web nunca fala com a máquina do piloto.** Ela depende só de
   `@telemetry/contracts` e lê a cloud-api.
3. **A LLM é só do desktop.** `adapter-llm` não está na lista de pacotes
   permitidos da cloud-api nem da web. Análise com modelo roda na máquina de
   quem pediu, com a chave de quem pediu.

## Consequências que valem registrar

**O servidor HTTP local morreu.** Antes o front do piloto falava com um Hono em
`localhost`. Com Electron, o renderer conversa com o processo principal por IPC:
um servidor a menos, uma porta a menos, sem CORS e sem superfície aberta na
máquina do piloto. A borda continua sendo borda — `ipc-handlers.ts` valida,
chama **um** caso de uso e devolve DTO, igual a um controller.

**Dois composition roots.** Um por aplicação que monta casos de uso
(`apps/desktop/src/main/composition-root.ts` e
`apps/cloud-api/src/composition-root.ts`). A web não tem: ela não monta caso de
uso nenhum.

**NestJS entra com uma regra.** Nest traz injeção de dependência própria, que
competiria com o nosso composition root. A regra é **"o módulo liga, não
pensa"**: `useFactory` chamando `buildCloudUseCasesFromEnv`, controllers finos,
nenhum `@Injectable` com regra de negócio. O `pnpm arch` já reprovou uma
violação dessa regra durante a própria escrita deste ADR — o módulo estava
criando o adapter de Postgres em vez de pedir ao composition root.

## O que se aceita perder

- **Três aplicações para manter**, com três ciclos de build e três formas de
  empacotar.
- **Um mesmo dado em dois lugares** (SQLite local e Postgres). Eles podem
  divergir; são donos diferentes, não réplicas — ver ADR 0015.
- **Complexidade de sincronização** que não existiria se tudo fosse online.
  É o preço direto da autonomia, que foi o requisito.

## Alternativa descartada

**Uma aplicação web com um agente leve no Windows.** O agente só faria upload e
toda a análise seria no servidor. Mais simples de manter, e joga fora a razão de
o produto existir: o piloto sai do carro e quer ver a análise agora, não quando
a conexão dele deixar.
