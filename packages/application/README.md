# @telemetry/application

Casos de uso e as portas que eles exigem. Depende **só** do domínio.

## CQS

| | `commands/` | `queries/` |
|---|---|---|
| Efeito | muda estado | nenhum |
| Retorno | nada, ou o id do que foi criado | os dados pedidos |
| Portas | `...WriterPort` + leitores necessários | só `...ReaderPort` |

A separação das portas é o que torna a regra verificável pelo compilador: uma
query que recebe apenas leitores não tem como escrever. Ver
`docs/adr/0010-cqs-na-aplicacao.md`.

## Portas

Interfaces que a aplicação **exige** do mundo externo — declaradas por quem as
usa, implementadas pelos adapters. Detalhes em `src/ports/README.md`.

## Suítes de contrato

`@telemetry/application/testing` exporta a suíte que **toda** implementação de
porta precisa passar. É a definição operacional de "substituível": o adapter em
memória passa hoje, o de disco terá que passar amanhã, e nenhum caso de uso muda.

```ts
describeSessionStoreContract('InMemorySessionStore', () => {
  const store = createInMemorySessionStore();
  return { reader: store, writer: store };
});
```
