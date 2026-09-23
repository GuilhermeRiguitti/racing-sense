# ADR 0014 — Um login para as duas aplicações, com iron-session

**Status:** Aceito · 2026-09-17

## Contexto

O piloto usa duas aplicações: o app do Windows e a web. É a mesma pessoa e a
mesma conta — ele não deveria ter duas senhas, nem logar duas vezes por motivos
diferentes.

## Decisão

A **cloud-api emite a sessão**, num cookie selado com `iron-session`. As duas
aplicações se autenticam contra ela.

- **Web**: o navegador guarda e reenvia o cookie, como em qualquer site.
- **Desktop**: o Chromium do Electron guarda o cookie na sessão do app
  (`session.defaultSession.fetch`). O `adapter-http` recebe esse `fetch`
  injetado e **nunca toca em `Set-Cookie`, header ou token**.

O segredo (`SESSION_SECRET`) é do servidor. Sem ele, a cloud-api não sobe: falhar
ao iniciar é melhor que servir com sessão forjável.

## Por que iron-session

O cookie é criptografado e assinado, e carrega só o `pilotId`. Não há tabela de
sessões para consultar, invalidar ou replicar — o que mantém a cloud-api simples
enquanto ela for um processo só.

Para o Electron, cookie funciona melhor que token guardado pelo app: quem
armazena é o Chromium, não código nosso, e não existe token em disco para
vazar em log ou em crash dump.

## A porta

A aplicação conhece `IdentityPort` — `signIn`, `signOut`, `currentPilot`.
Nenhum tipo de cookie aparece na assinatura. Trocar iron-session por JWT, OAuth
ou sessão em banco é trocar o adapter.

`401` em `/auth/me` significa "não logado", não falha: o app do Windows abre
igual, offline, e só esconde o que depende da nuvem.

## O que se aceita perder

- **Invalidar sessão no servidor é difícil** — é a contrapartida de não ter
  estado. Mitigação quando fizer falta: encurtar o `maxAge` ou versionar o
  segredo.
- **Cookie exige mesmo domínio ou CORS bem configurado** entre web e cloud-api.
- **Rotacionar o segredo derruba todo mundo.** É aceitável, e precisa estar
  escrito no runbook quando existir.

## Sinal para reavaliar

Se aparecer login social, múltiplos dispositivos com gestão de sessão, ou
necessidade de derrubar sessão específica, o cookie selado deixa de bastar e a
conversa vira sessão com estado — outro ADR.
