---
name: novo-caso-de-uso
description: Roteiro para adicionar funcionalidade respeitando as camadas do projeto (hexagonal + CQS). Use ao criar um caso de uso, uma porta, um adapter, uma rota HTTP ou ao integrar qualquer biblioteca externa — e quando estiver em dúvida sobre em qual pacote um arquivo novo deve nascer ou por que o `pnpm arch` reprovou.
---

# Caso de uso novo

## Antes de escrever: responda duas perguntas

**1. Isso muda estado?**

- Muda → `packages/application/src/commands/`, devolve no máximo um id, vira `POST`.
- Não muda → `packages/application/src/queries/`, devolve dados, vira `GET`.

Nunca os dois. Produzir texto com LLM **muda estado** (custa dinheiro e persiste):
é comando. Ver `docs/adr/0010-cqs-na-aplicacao.md`.

**2. Precisa de algo do mundo externo?**

Disco, rede, relógio, id aleatório, LLM, banco — tudo isso entra por **porta**,
nunca por import direto.

## Ordem de trabalho

1. **Regra de negócio → `domain`.** Se a lógica vale independente de onde os dados
   vêm, ela é do domínio. Teste chamando direto, sem mock.

2. **Porta → `application/src/ports/`,** se faltar alguma. A porta é declarada por
   quem a usa e fala o vocabulário do domínio. Se `Buffer`, `Request` ou
   `LanguageModel` aparecer na assinatura, a lib vazou — refaça.

3. **Caso de uso → `application/src/commands|queries/`:**

```ts
export interface ImportReferenceLapCommand { sessionId: SessionId; lapNumber: number }
export interface ImportReferenceLapDeps { sessions: SessionReaderPort; referenceLaps: ReferenceLapWriterPort }
export type ImportReferenceLapHandler = (c: ImportReferenceLapCommand) => Promise<ReferenceLapId>;

export function createImportReferenceLapHandler(deps: ImportReferenceLapDeps): ImportReferenceLapHandler {
  return async (command) => { /* orquestra: lê portas, chama domínio, escreve */ };
}
```

Query recebe **só** `...ReaderPort` — é assim que o compilador garante que ela
não escreve.

4. **Adapter → `packages/adapter-*`,** se a porta for nova. Vai no adapter que já
   é dono daquela dependência; lib nova pede adapter novo **e** uma linha no mapa
   em `scripts/architecture.config.mjs` (com ADR, porque é mudança de arquitetura).

5. **Contrato do adapter → `application/src/testing/*.contract.ts`.** Toda porta
   com mais de uma implementação possível tem suíte de contrato, e todo adapter
   roda a mesma. É o que torna "substituível" um fato verificado.

6. **Ligação → `apps/api/src/composition-root.ts`.** Único arquivo que escolhe
   implementação.

7. **Rota → `apps/api/src/http/routes.ts`.** Valida com o schema de
   `@telemetry/contracts`, chama **um** caso de uso, devolve DTO. Regra de negócio
   em rota é erro de camada.

8. **DTO → `packages/contracts`,** se o formato sai na API. Único lugar com `zod`.

9. `pnpm check`.

## Erros comuns (e o que o `pnpm arch` vai dizer)

| Sintoma | Causa | Conserto |
|---|---|---|
| "importa o adapter X" | caso de uso ou rota escolhendo implementação | receba a porta; ligue no composition root |
| "não pode tocar em API de plataforma" | `node:*` em pacote puro | mova para `adapter-fs` atrás de uma porta |
| "declara a lib Y" | lib nova na camada errada | adapter que seja dono dela |
| "import profundo" | `@telemetry/x/src/...` | importe o ponto de entrada |
| Teste precisa de disco ou rede | dependência concreta vazou | injete porta e use o adapter em memória |

## Checklist

- [ ] Comando ou query, nunca os dois
- [ ] Query só com portas de leitura
- [ ] Nenhum tipo de lib na assinatura da porta
- [ ] Erro lançado é do domínio (`DomainError`), com código traduzido na borda
- [ ] Stub lança `NotImplementedError` dizendo o que falta
- [ ] Adapter novo roda a suíte de contrato
- [ ] `pnpm check` verde
