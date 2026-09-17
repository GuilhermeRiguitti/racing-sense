# Camada de aplicação

Casos de uso e as portas que eles exigem. Depende **só** do domínio.

## CQS

Um caso de uso ou muda estado, ou responde pergunta. Nunca os dois.

| | `commands/` | `queries/` |
|---|---|---|
| Efeito | muda estado | nenhum |
| Retorno | nada, ou um identificador do que foi criado | os dados pedidos |
| Portas que recebe | `...WriterPort` (e leitores de que precisar) | só `...ReaderPort` |

A separação das portas de leitura e escrita é o que torna a regra verificável: uma
query que receba apenas leitores **não tem como** escrever, e isso o compilador
garante.

Caso limite resolvido: gerar a análise do agente custa dinheiro e persiste
resultado, então é `RequestLapAnalysis` (comando). Ler o relatório pronto é
`GetLapAnalysis` (query). "Gerar e devolver na mesma chamada" seria cômodo e é
exatamente o que a regra proíbe.

## Forma de um caso de uso

```ts
export interface ImportReferenceLapCommand { /* entrada */ }
export interface ImportReferenceLapDeps { /* portas */ }
export type ImportReferenceLapHandler = (command: ImportReferenceLapCommand) => Promise<ReferenceLapId>;

export function createImportReferenceLapHandler(deps: ImportReferenceLapDeps): ImportReferenceLapHandler;
```

Fábrica que recebe as portas e devolve o handler. Sem classe, sem container de DI,
sem decorator: a injeção é o argumento da função, e quem monta tudo é o
composition root de cada aplicação (`apps/desktop`, `apps/cloud-api`).
