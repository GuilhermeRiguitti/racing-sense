# ADR 0023 — A leitura ao vivo entra, pelo arquivo mapeado do SDK, via FFI e sem addon compilado

**Status:** Aceito · 2026-09-25

## Contexto

O ADR 0002 deixou a telemetria ao vivo para a fase 2 por causa do custo de um
addon nativo em C++: node-gyp, Python, Visual Studio Build Tools, rebuild a cada
troca de versão do Node ou do Electron, e CI que não testa a parte mais frágil.

O piloto quer ver o que está acontecendo **enquanto** ele — ou um companheiro de
equipe, com ele de engenheiro — está na pista, sem esperar o `.ibt` ser fechado e
ingerido.

O ADR 0022 já fixou o canal: o arquivo mapeado oficial
`Local\IRSDKMemMapFileName`, só leitura. Ele tem o mesmo header e a mesma tabela
de variáveis do `.ibt`, sem o disk sub header, com até 4 buffers que o sim
alterna a 60 Hz.

Hoje existe o `koffi`: FFI para Node com binário pronto por plataforma (N-API,
então funciona no Electron sem rebuild). Com ele, as cinco funções do `kernel32`
que a leitura precisa (`OpenFileMappingW`, `MapViewOfFile`, `VirtualQuery`,
`UnmapViewOfFile`, `CloseHandle`) são declaradas em TypeScript.

## Decisão

1. A leitura ao vivo entra no escopo agora, só de leitura (ADR 0022).
2. A ligação com o Windows é o `koffi`, em `apps/desktop/src/main/ibt/live-memory.ts`.
   Nenhum addon C++ próprio, nenhuma lib de terceiro que embrulhe o SDK.
3. A interpretação dos bytes é pura, em `ibt/live.ts`, reaproveitando o decoder do
   `.ibt`: header, tabela de variáveis, session info CP1252. O congelamento do
   frame segue o `irsdk_getNewData` oficial: anota o `tickCount`, copia, relê; se
   mudou, descarta.
4. A tela pergunta o frame mais recente pelo IPC (`live:snapshot`), no ritmo em
   que desenha. Frame ao vivo não vira evento, e nada lê a memória quando a tela
   ao vivo está fechada.
5. **Ao vivo é visualização, não gravação.** Nada do que se lê ao vivo vai para o
   banco. O material de análise continua sendo o `.ibt` que o sim grava (ADR 0019):
   ao sair do carro, o fluxo de sempre ingere a sessão.

## Por quê

- O `koffi` remove exatamente o custo que o ADR 0002 apontou: não há compilação na
  máquina de quem desenvolve nem no empacotamento. O teste da ligação roda no
  Windows de verdade, criando um mapeamento próprio — sem o sim aberto.
- Declarar as funções do `kernel32` à mão deixa à vista, num arquivo só, tudo o
  que o app pede ao sistema: nenhum `OpenProcess`, nenhum broadcast. Uma lib que
  embrulha o SDK traria de brinde o `irsdk_broadcastMsg` que o ADR 0022 proíbe.
- Não gravar o ao vivo evita duas fontes para a mesma volta. O `.ibt` é o dado
  exato do sim; o ao vivo, visto a 10 quadros por segundo pela tela, não é.

## O que se aceita perder

- **O layout ao vivo não está conferido contra o sim.** O teste prova a ligação
  com o Windows e a consistência interna; o header e os buffers da memória do sim
  aberto ainda não foram lidos por este código (`docs/pendencias.md`, item 14).
- **Dependência de um mantenedor só.** O `koffi` é mantido por uma pessoa. Se ele
  parar, a troca é por outro FFI ou por um addon próprio — só `live-memory.ts`
  muda.
- **Handle preso a um sim que caiu.** Se o sim fecha sem limpar o bit de conectado,
  a região continua viva enquanto o app segura o handle, e a tela mostra o último
  frame parado. O SDK oficial resolve com um tempo limite; aqui ele ainda não foi
  medido.
- **Nada de análise ao vivo.** Delta contra referência, setores e a volta ideal
  continuam existindo só depois da ingestão do `.ibt`.
- **O engenheiro vê o que o iRacing entrega para a posição dele.** Assistindo de
  outro computador, o sim do engenheiro só expõe o que ele libera para quem não
  está ao volante — tipicamente os canais `CarIdx*` (posição na pista, volta,
  marcha, RPM, tempos), não acelerador, freio ou pneus. Levar a telemetria
  completa do piloto para o engenheiro exige enviar dado de uma máquina para a
  outra, e isso é decisão de topologia que este ADR **não** toma (item 14).

## Alternativa descartada

- **Addon nativo próprio (node-gyp).** É o caminho que o ADR 0002 temia, e o
  `koffi` entrega o mesmo acesso sem o custo de toolchain.
- **Bibliotecas prontas do SDK para Node** (`node-irsdk` e derivadas). Trazem
  addon compilado e expõem broadcast; umas estão paradas há anos na versão do
  Node.
- **Empurrar cada frame por evento, a 60 Hz.** Contraria a regra de que evento é
  aviso, não dado, e ocuparia o IPC mesmo com a tela fechada.

## Sinal para reverter

- O Electron passar a recusar o carregamento do `koffi` (ou N-API mudar de forma
  incompatível): troca-se `live-memory.ts` por um addon próprio.
- O iRacing mudar o SDK para um canal diferente do arquivo mapeado.
