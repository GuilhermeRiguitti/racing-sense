# Pendências

O que ainda não foi decidido ou validado. Item resolvido sai daqui e vira ADR ou
código — esta lista não é histórico.

A numeração é estável: item que sai não faz os outros andarem, para referência de
fora não apontar para o lugar errado.

## 5. Modelo e custo do agente

Default atual é `gemini-2.5-flash`, escolhido por ser barato e estável — não por
medição. O SDK instalado também tipa `gemini-3.5-flash` e `gemini-3-flash-preview`.
Falta: medir custo por análise, comparar qualidade e definir teto de gasto.

## 8. api contra Postgres de verdade

A api tem schema Prisma, migration inicial (`apps/api/prisma/migrations`),
cadastro, login com cookie selado, publicação, visibilidade e links (ADR 0020).
Subiu e respondeu sem banco (Swagger, 401, validação), mas **nenhuma rota foi
exercitada contra um Postgres real**. Falta: teste de ponta a ponta dos services
(publicar, abrir por link, revogar, apagar) com Postgres em container, e o mesmo
no CI.

## 9. Apagar na nuvem o que foi apagado no desktop

A api já tem `DELETE /sessions/{sessionId}`. O desktop ainda não tem ação de apagar
sessão, e portanto não chama a rota. Isso **não** é problema de sincronização —
divergência entre os dois lados é aceitável por design (ADR 0017). É o piloto
retirando algo que publicou, e precisa existir.

O resto da divergência (sessão reprocessada local que não voltou para a nuvem)
fica como está: a web pode mostrar a versão antiga sem prejuízo.

## 10. Gráficos e UX do desktop

O que o piloto vê é o produto. A tela de análise tem delta contra a
referência, abas de pilotagem, pneus, suspensão e carro, trechos fora da pista
marcados, o painel do engenheiro, a sessão volta a volta e a ficha de acerto.
Falta: zoom num trecho e o relatório do agente ancorado no trecho. Usar a skill
`dataviz` antes de mexer em gráfico.

## 12. Canais de engenharia não conferidos contra arquivo real

Os nomes de pneu, suspensão e motor gravados na ingestão (`LFtempM`,
`LFpressure`, `LFrideHeight`, `LFwearL`, `dc*`…) e os campos de acerto e
limites da session info (`CarSetup`, `DriverCarSLShiftRPM`,
`DriverCarFuelMaxLtr`) vieram da documentação do SDK, **não** de um `.ibt`
aberto. Canal com nome errado não quebra nada — some da lista e a aba fica
vazia. O teste `ibt-real-file.test.ts` confere isso quando há fixture; falta
rodá-lo com os oito arquivos. Também não se sabe ainda se `LFwear*` muda com o
carro na pista ou só quando a equipe mede no box.

## 13. Sessão ingerida antes dos canais novos

A ingestão é idempotente por arquivo: sessão já gravada não é reprocessada, e
por isso fica sem os canais de engenharia, os trechos fora da pista e o acerto
(a tela diz isso em vez de mostrar vazio). Hoje o caminho é apagar o banco
local e deixar o watcher reingerir a pasta. Reprocessar sob demanda é a ação que
falta — e é reprocessamento local, não sincronização (ADR 0017).

## 11. Empacotamento do desktop

`electron-builder` configurado, instalador Windows assinado e auto-update. Inclui
o rebuild nativo do `better-sqlite3` para a versão do Electron.

## 14. Leitura ao vivo contra o sim aberto

O layout ao vivo foi conferido contra o sim aberto em 2026-09-26, num treino
(`ibt/live-real-sim.test.ts`, medidas em `docs/formato-ibt.md`). Falta:

- conferir nome de piloto **com acento** numa session info ao vivo (o da
  conferência era ASCII);
- anotar quais canais ficam **parados** em cada posição — ao volante, espectador,
  engenheiro de equipe — em vez de presumir. A tela mede isso na coluna "Ao vivo";
- medir quanto tempo o `tickCount` fica parado com o sim pausado ou em replay,
  antes de escolher o tempo limite para soltar o handle de um sim que caiu.

Para a transmissão ao engenheiro (ADR 0024), o que a medida disse: o frame cru
tem 8616 B, e 6768 B dele são arrays, quase todos um valor por carro — que não
viajam. O carro do piloto sozinho fica em ~1,2 KB por tick — ~70 KB/s a 60 Hz, antes do
envelope. Com `numBuf` 3, o desktop do piloto recupera até ~50 ms de leitura
atrasada sem perder tick.

A transmissão para o engenheiro está decidida no ADR 0024 e depende do item 8:
sem Postgres não há login, e sem login não há sala fechada.

## 15. Overlay contra o sim numa sessão

O overlay (ADR 0025) foi desenhado sobre os nomes e o significado que a
documentação do SDK dá, e conferido só contra um sim falso
(`tests/support/fake-sim.ts`, `node apps/desktop/tests/e2e/drive-app.mjs --overlay`).
Os nomes de canal que o overlay lê foram conferidos contra o sim aberto em
2026-09-29 (`ibt/live-real-sim.test.ts`): todos existem. Com o iRacing numa
corrida, falta conferir:

- o gap do relative (`CarIdxEstTime`) e o da classificação (`CarIdxF2Time`)
  contra o relative e a classificação do próprio sim, inclusive multiclasse e na
  linha de chegada;
- se `CarIdxPosition` / `CarIdxClassPosition` vêm preenchidos no treino e na
  classificação, ou só na corrida (hoje a ordem fora da corrida sai da melhor
  volta de qualquer jeito);
- o SOF calculado contra o do resultado oficial da mesma sessão;
- o sentido do `Clutch` (o overlay mostra `1 − Clutch` como posição do pedal);
- `SessionLapsRemainEx` numa corrida por tempo — se conta a volta em curso — e o
  valor de `SessionTimeRemain` numa sessão sem limite de tempo (presumido 604800);
- o consumo por volta medido contra o que o sim mostra na caixa de combustível;
- numa sessão de Road Atlanta (26/09, 13-19-14), a volta de referência do
  `LapDeltaToSessionBestLap` não foi identificada: não bate com nenhuma volta do
  arquivo. Provavelmente é de um `.ibt` anterior da mesma sessão do sim, ou uma
  volta que o sim invalidou; o método (por distância) já está conferido
  (`docs/formato-ibt.md`);
- se as janelas ficam por cima do sim em janela sem borda, e se alguma rouba
  foco (não deveria: `focusable: false`).

## 16. Credencial da Data API do iRacing

O ADR 0026 decide que a api busca catálogo de carros e mapa de pista na Data API
do iRacing (o serviço web do site de membros — não o `.ibt` nem o SDK). O acesso
é OAuth2, e o Client ID e o Client Secret são concedidos pelo iRacing por pedido.
Falta: pedir a credencial (app gratuito, só leitura, dado do próprio piloto) e,
com ela em mãos, conferir os nomes de campo de `/data/car/get`,
`/data/car/assets` e `/data/track/assets` contra uma resposta real. Depende
também do item 8: sem Postgres, a api não tem onde guardar o catálogo.
