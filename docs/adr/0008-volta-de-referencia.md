# ADR 0008 — Volta de referência importada

**Status:** Aceito · 2026-09-17

## Contexto

Analisar uma volta sozinha diz pouco. O valor aparece na comparação: contra a própria
melhor volta, contra outro piloto, contra uma hot lap de referência.

## Decisão

O sistema importa um `.ibt` **só para extrair uma volta** e guardá-la como referência
(`referenceLapSchema` em `@telemetry/contracts`). A referência também pode ser promovida
a partir de uma volta já ingerida.

Regras:

1. A comparação acontece no eixo **distância** (`lapDistPct`), nunca no eixo tempo.
2. Referência e volta analisada precisam ser da **mesma pista e do mesmo carro**.
   Combinação diferente é recusada na validação.
3. A referência guarda séries já normalizadas, não o arquivo inteiro: ela é consultada
   toda vez que uma volta nova chega.

## Por quê

- **Distância, não tempo:** quem freia mais tarde desalinha todo o resto da volta no
  eixo do tempo. O delta sairia crescendo sozinho, sem significado físico.
- **Mesma pista e carro:** o delta entre carros diferentes existe matematicamente e não
  significa nada. Recusar na validação evita o pior tipo de bug — o que produz um
  número plausível e errado.
- **Séries normalizadas guardadas:** a referência é lida com muito mais frequência do
  que escrita.

## O que se aceita perder

Comparar mesma pista com carros diferentes (útil para quem troca de categoria) fica de
fora. Se virar requisito, vem como modo explícito com aviso na interface — não como
afrouxamento silencioso da validação.
