# ADR 0010 — CQS na camada de aplicação

**Status:** Aceito · 2026-09-17

## Contexto

Os casos de uso deste sistema têm perfis muito diferentes. Ingerir um arquivo
escreve muito e é lento. Listar voltas é leitura pura e roda a cada clique. Pedir
análise ao modelo custa dinheiro e não é idempotente.

Misturar os três no mesmo tipo de operação leva ao clássico "o GET que também
grava" — e daí a cache errado, retry que cobra duas vezes e teste que não
consegue afirmar nada.

## Decisão

Todo caso de uso é **comando** ou **query**, nunca os dois:

| | `commands/` | `queries/` |
|---|---|---|
| Efeito | muda estado | nenhum |
| Retorno | nada, ou o identificador do que foi criado | os dados pedidos |
| Portas | `...WriterPort` + leitores necessários | só `...ReaderPort` |

As portas de leitura e escrita são interfaces separadas. Uma query que recebe
apenas leitores **não tem como** escrever: a regra deixa de depender de revisão e
passa a ser verificada pelo compilador.

Na borda HTTP a separação aparece direto: comando é `POST` e devolve `201` com
id, ou `202` sem corpo; query é `GET`.

## O caso que define a regra

Gerar a análise do agente produz texto — parece query. Mas custa dinheiro, não é
idempotente e o resultado é persistido. Então:

- `RequestLapAnalysis` (comando) gera e grava, devolve `202`;
- `GetLapAnalysis` (query) lê o que foi gravado.

"Gerar e devolver na mesma chamada" seria mais cômodo e é exatamente o que a
regra proíbe: o front recarregar a tela passaria a custar uma chamada de LLM.

## Por quê

- Query é cacheável e repetível sem medo — a propriedade vem da assinatura, não
  de disciplina.
- Comando tem um ponto único onde o efeito acontece, o que dá lugar para log,
  fila, retry e limite de gasto quando fizer falta.
- Teste fica direto: comando se verifica pelo efeito nas portas de escrita; query,
  pelo retorno.

## O que se aceita perder

- **Uma ida e volta a mais** no fluxo "pedir análise e mostrar": `POST` e depois
  `GET`. É o custo de não pagar LLM a cada refresh.
- **Dois casos de uso onde um resolveria**, em fluxos simples.
- Não é CQRS: não há modelo de leitura separado, nem event sourcing, nem outro
  banco. Só a separação de responsabilidade. Se um dia a leitura pedir modelo
  próprio, isso é outro ADR.

## Alternativa descartada

**Serviço único por área** (`TelemetryService` com tudo dentro). Menos arquivos,
mas a assinatura deixa de dizer se a operação escreve — e o teste volta a
depender de ler a implementação.
