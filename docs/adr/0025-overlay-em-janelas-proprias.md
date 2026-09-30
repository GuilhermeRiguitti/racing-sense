# ADR 0025 — O overlay é um conjunto de janelas próprias do Electron, transparentes e sem foco, montadas a partir do que o SDK entrega

**Status:** Aceito · 2026-09-29 · item 6 (logotipo e modelo) superado por ADR 0026

## Contexto

A leitura ao vivo existe (ADR 0023) e mostra os canais numa tabela. O piloto quer,
**enquanto pilota**, o que os apps de overlay mostram por cima do sim — Kapps,
RaceLab, iOverlay: relative, classificação, carro, marca, iRating, safety rating e
carteira dos outros pilotos, delta, pedais, combustível.

O `CLAUDE.md` deixava o overlay "não decidido: ADR antes de código", e a política
do iRacing (ADR 0022, skill `politica-iracing`) já traçava a linha: overlay em
janela própria, nunca desenhado dentro do sim por injeção.

Quase tudo o que um overlay mostra já vem pronto do sim:

- **Da session info (`DriverInfo.Drivers`)**: nome, número, carro
  (`CarScreenName`), classe e cor da classe, `IRating`, `LicString` ("A 3.45",
  carteira e safety rating) e `LicColor`, pace car e espectador.
- **Dos canais `CarIdx*`**, um valor por carro: posição, posição na classe, volta,
  distância na volta, superfície (pista, box, fora do mundo), `EstTime` (tempo
  estimado até o ponto da pista onde o carro está), `F2Time` (atrás do líder na
  corrida), última e melhor volta.
- **Dos canais do carro do piloto**: `LapDeltaToBestLap` e irmãos, pedais,
  marcha, `FuelLevel`, `SessionFlags`, `CarLeftRight`, `SessionLapsRemainEx`.

## Decisão

### Janela

1. **Uma janela do Electron por widget**, transparente, sem moldura, sempre por
   cima (`screen-saver`), fora da barra de tarefas. Travada, ela **não pega foco
   nem mouse** (`focusable: false`, `setIgnoreMouseEvents`): o clique atravessa
   para o sim, e o volante nunca perde a entrada para o app.
2. **Mover é um modo.** O piloto destrava pela tela "Overlay" do app; aí as
   janelas aceitam arrastar e mostram moldura e escala. Travar de novo grava a
   posição.
3. **O tamanho vem do conteúdo.** A janela mede o que desenhou e pede ao processo
   principal o tamanho exato; o piloto escolhe só a escala. Janela transparente
   sem moldura não redimensiona pela borda no Windows, e a classificação muda de
   altura quando entra um carro.

### Dado

4. **O processo principal monta o quadro do overlay** a partir do mesmo
   `snapshot` da leitura ao vivo, uma vez por tick, e as janelas perguntam
   (`overlay:frame`) — o padrão do ADR 0023: frame ao vivo não vira evento. As
   regras (gap relativo, ordem da classificação, consumo por volta) são funções
   puras em `main/domain/`.
5. **Número do overlay é número do sim.** Gap relativo sai de `CarIdxEstTime`;
   gap de corrida, de `CarIdxF2Time`; delta, de `LapDeltaTo*`; voltas que faltam,
   de `SessionLapsRemainEx`; carteira e SR, de `LicString`. O app só **conta** o
   que o sim não entrega somado: combustível gasto por volta (diferença de
   `FuelLevel` entre dois cruzamentos da linha, média da stint inteira, sem
   janela escolhida) e o SOF da classe (média exponencial do iRating, a fórmula
   que a comunidade usa).
6. **A marca sai do nome que o sim dá ao carro**, contra uma lista de
   fabricantes. Nome sem fabricante conhecido fica sem marca, nunca com uma
   adivinhada. Sem logotipo: marca registrada não entra no pacote.
7. **Os pedais e o gráfico da volta ao vivo leem todos os ticks** (`live:ticks`):
   todos os buffers mais novos que o último lido, como o ADR 0024 prevê para a
   transmissão. Pergunta a cada ~33 ms cabe na folga de ~50 ms dos três buffers.

### O que não muda

8. **Ao vivo continua não gravando** (ADR 0023). O overlay lê, desenha e esquece.
9. **Dado de outros pilotos só na tela do próprio piloto** (ADR 0022). Nome,
   iRating e carteira do grid aparecem no overlay dele, como no sim; nada disso
   sobe para a api nem é guardado.
10. **A configuração é arquivo local** (`overlay.json` na pasta de dados), não
    tabela do SQLite: posição de janela não é dado de corrida.

## Por quê

- Janela própria é o lado tolerado da linha do ADR 0022 — o que Kapps, RaceLab e
  iOverlay fazem há anos. Desenhar dentro do sim exigiria hook de DirectX.
- Uma janela por widget, e não uma janela transparente do tamanho do monitor:
  cada uma é pequena para o compositor, pode ir para outro monitor, e uma falha de
  desenho não apaga as outras.
- Sem foco é a garantia mais importante: overlay que rouba o foco tira o comando
  do piloto no meio da curva.
- Montar o quadro no processo principal faz as cinco janelas custarem uma leitura
  por tick, não cinco — e mantém a regra de corrida fora do renderer.
- Número do sim, e não recalculado, pela mesma razão das regras 15 e 18: a conta
  do iRacing é a que o piloto vê no sim, e uma segunda conta divergiria dela.

## O que se aceita perder

- **Tela cheia exclusiva.** O overlay só aparece com o sim em janela ou janela
  sem borda; em tela cheia exclusiva o sim cobre tudo. É assim em todo overlay
  por janela.
- **VR.** Nada aparece dentro do headset. Overlay em VR é outra técnica
  (compositor do OpenXR/SteamVR) e fica fora.
- **Logotipo de marca.** O piloto vê "Ferrari", não o cavalinho.
- **Radar de verdade.** O SDK não dá a posição lateral dos outros carros, só
  `CarLeftRight` (tem carro à esquerda, à direita, dois). O "radar" mostra a
  distância na pista e o lado, não o desenho do carro ao lado.
- **Estimativa de ganho de iRating.** Os apps grandes mostram; a fórmula é
  engenharia reversa sem confirmação do iRacing, e errar o número de que o piloto
  mais gosta é pior que não mostrar. Fica para quando houver como conferir.
- **Conferência contra o sim.** `CarIdxEstTime`, `CarIdxF2Time` e o SOF ainda não
  foram comparados com o que o sim mostra (`docs/pendencias.md`, item 15).
- **Atalho de teclado global.** Destravar é pela tela do app; um atalho global
  poderia colidir com o que o piloto mapeou no sim.

## Alternativa descartada

- **Uma janela transparente do tamanho do monitor**, com os widgets posicionados
  dentro. Mais simples de programar, mas a camada transparente em tela inteira
  pesa no compositor a cada quadro, e mover widget entre monitores deixa de
  existir.
- **Cada janela lendo a memória compartilhada por conta própria.** O renderer não
  tem Node (ADR 0012), e cinco leituras por tick para o mesmo dado.
- **Empurrar o quadro do overlay por evento a 60 Hz.** Mesma razão do ADR 0023.

## Sinal para reverter

- O iRacing passar a oferecer overlay oficial por API, ou proibir por escrito
  overlay de terceiros.
- Janela transparente sempre por cima começar a custar quadro no sim de forma
  medida: aí uma janela só, ou taxa menor.
