---
name: novo-adr
description: Cria um novo Architecture Decision Record no formato do projeto. Use quando uma decisão estrutural for tomada — escolha de dependência, mudança de topologia, formato de dados, troca de provedor — ou quando o usuário pedir para registrar/documentar uma decisão, ou quando uma decisão antiga precisar ser superada.
---

# Novo ADR

## Quando um ADR se justifica

- A decisão amarra o projeto a uma dependência, um formato ou uma topologia
- Alguém vai perguntar "por que não fizeram do jeito óbvio?" daqui a três meses
- Foi preciso escolher entre duas opções defensáveis

Se nada disso vale, não escreva ADR: um comentário no código resolve.

## Passos

1. Leia `docs/adr/README.md` e o ADR mais recente, para pegar numeração e tom.
2. Numere sequencialmente: `docs/adr/NNNN-titulo-em-kebab-case.md`.
3. Escreva as seções abaixo.
4. Adicione a linha na tabela de índice do `docs/adr/README.md`.
5. Se o ADR resolve um item de `docs/pendencias.md`, **remova o item de lá** — aquela
   lista é o que está em aberto, não histórico.
6. Se o ADR supera um anterior, marque o antigo com `Superado por ADR NNNN`. Nunca
   reescreva a decisão antiga: o histórico é o valor do formato.

## Estrutura

```markdown
# ADR NNNN — <decisão em uma linha, no indicativo>

**Status:** Aceito | Proposto | Superado por ADR XXXX · AAAA-MM-DD

## Contexto
O que era verdade quando a decisão foi tomada. Sem justificar ainda.

## Decisão
O que foi decidido, direto.

## Por quê
As razões reais, não as apresentáveis.

## O que se aceita perder
O custo que se escolheu pagar. ADR sem esta seção é propaganda, não registro.

## Alternativa descartada  (quando houver)
O que mais foi considerado e por que não venceu.

## Sinal para reverter  (quando fizer sentido)
O que precisaria acontecer para a decisão deixar de valer.
```

## Tom

Português, direto, sem adjetivo de marketing. Um ADR que só lista vantagens está
escondendo o trade-off — e o trade-off é a parte que alguém vai precisar daqui a um ano.
