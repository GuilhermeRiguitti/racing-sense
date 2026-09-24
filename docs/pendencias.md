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
