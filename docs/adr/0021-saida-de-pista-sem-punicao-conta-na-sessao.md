# ADR 0021 — Saída de pista sem punição conta na sessão; a referência continua limpa

**Status:** Aceito · 2026-09-24
**Supera em parte:** ADR 0018 (só a parte da saída de pista; o resto continua)

## Contexto

O ADR 0018 fez de qualquer saída de pista motivo para tirar a volta de toda
análise. Com a tela da sessão volta a volta (pressão, temperatura, combustível e
tempo por volta), apareceram dois problemas:

1. **As voltas que de fato poluem continuavam na tela.** Out lap, in lap e
   volta cortada pela gravação entravam nos gráficos da sessão, com pressão de
   pneu frio e combustível de reabastecimento. Era isso que o piloto via como
   "média errada".
2. **O critério estrito esvaziava a sessão.** Nos arquivos reais quase toda volta
   tem algum toque fora dos limites. Tirando todas, não sobra evolução para ver.

O piloto definiu a regra: saída de pista que o sim **não puniu** é uma volta
normal para acompanhar a sessão; a que tomou **slow down** não é.

O `.ibt` tem esse fato. `SessionFlags` traz o bit `irsdk_furled` (`0x80000`), a
bandeira preta de advertência. Medido nos 83 arquivos do piloto em 2026-09-24:

- ela acendeu 33 vezes;
- 30 vezes na mesma volta de uma saída de pista, com mediana de 1,4 s depois
  da última amostra fora da pista;
- 2 vezes só na volta seguinte à saída;
- 1 vez sem nenhuma saída de pista antes, num arquivo do Porsche em Imola;
- ficou acesa de 0,6 s a 39 s, mediana de 2,2 s;
- várias saídas de pista não a acenderam — o sim só pune o corte que dá
  vantagem.

## Decisão

A volta passa a ter três situações:

| Situação | O que é | Sessão (gráficos, evolução) | Comparação e referência |
|---|---|---|---|
| **Válida** | completa, sem box, sem sair da pista | entra | entra |
| **Saiu da pista** | completa, sem box, saiu da pista **sem** slow down | entra | **não** entra |
| **Inválida** | box, gravação cortada ou slow down | não entra | não entra |

- Marcação nova `slowdown`: a volta em que o bit `irsdk_furled` esteve aceso em
  qualquer amostra. Fato binário do arquivo, sem limiar.
- `countsForSession` é a regra da sessão; `isValidLap` continua sendo a da
  comparação e da referência, estrita como no ADR 0018.
- Na tela, a volta inválida fica **escondida** da tabela e dos gráficos da
  sessão, com um botão para mostrar. Ela continua gravada: é o registro do que
  o piloto rodou.
- A linha do tempo de ajustes usa a sessão inteira: mexer no balanço de freio
  numa in lap continua sendo uma mudança.

## Por quê

- A punição do sim é o critério de "corte que conta" que não precisa de número
  nosso. Duração fora da pista, distância cortada, perda de tempo — todos
  exigiriam um limiar, e o ADR 0018 já recusou limiar pelo mesmo motivo.
- A referência continua limpa porque o custo dos dois erros não mudou: uma
  referência com corte desloca todo delta seguinte, em silêncio.
- Esconder em vez de só apagar a cor porque out lap e in lap não informam nada
  sobre ritmo e ocupavam metade de cada gráfico da sessão.

## O que se aceita perder

- **Não se prova que `irsdk_furled` é exatamente o slow down.** A correlação com
  a saída de pista é forte (30 de 33), mas a bandeira também acendeu uma vez sem
  saída nenhuma. Essa volta vira inválida sem ter cortado nada — aceito: se o sim
  advertiu, algo aconteceu nela.
- **O corte punido só na volta seguinte deixa a volta do corte como "saiu da
  pista".** Aconteceu 2 vezes em 33: o piloto cortou perto da linha e a
  advertência acendeu depois dela. A volta do corte, que ganhou tempo, entra na
  sessão. Ligar a advertência à saída que a causou exigiria dizer o que é
  "recente o bastante" — num arquivo ela acendeu 537 s depois da última saída.
- **Sessões já ingeridas não têm a marcação.** Precisam ser ingeridas de novo.
- **Batida, reboque e carro parado dentro da pista não entram na regra.** O
  piloto os citou como interrupção de sequência para uma média de várias voltas
  que não existe hoje; quando existir, é outro ADR.

## Alternativa descartada

**Manter o critério estrito e só esconder box e volta cortada.** Resolvia a
poluição dos gráficos, mas deixava a sessão quase vazia nos arquivos reais — o
problema que o ADR 0018 já registrava como custo.

**Limiar de tempo fora da pista.** Descartado pelo mesmo motivo do ADR 0018:
número escolhido, sem dado para calibrar, com efeito que depende de onde o
piloto saiu.

## Sinal para reverter

Se o piloto levar um slow down numa volta que o app não marcou, ou vir marcada
uma volta em que não houve punição, a leitura de `irsdk_furled` está errada e a
marcação precisa de outro fato do arquivo.
