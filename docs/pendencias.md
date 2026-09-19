# Pendências

O que ainda não foi decidido ou validado. Item resolvido sai daqui e vira ADR ou
código — esta lista não é histórico.

## ~~1. Validar o layout do formato contra um `.ibt` real~~ ✅ resolvido

Validado em 2026-09-19 contra oito arquivos, em dois carros e duas pistas: Ferrari
296 GT3 em Road Atlanta (288 canais, `bufLen` 1108) e Mercedes-AMG GT3 em Suzuka
(287 canais, `bufLen` 1101), build 2026.06 do sim. Três provas independentes:

- `bufOffset + recordCount × bufLen` deu **o tamanho exato** do arquivo;
- a soma de `tamanho × count` de todos os 288 canais deu **exatamente** `bufLen`;
- `LapDistPct` lido das amostras ficou em [0, 1] com máximo em 100% — um byte de
  deslocamento no offset transformaria isso em lixo na hora.

Também ficou resolvida a dúvida sobre a ordem dos campos: `sessionInfoLength` em
16 e `sessionInfoOffset` em 20, como o `irsdk.h` diz (e não como o documento de
referência inicial sugeria). Com a ordem trocada, a session info viria ilegível.

O teste que sustenta isso é `apps/desktop/src/main/ibt-real-file.test.ts`, que
**pula** quando não há fixture — ver `docs/fixtures.md`.

## 2. `ibt-telemetry` ou decoder próprio

A lib recomendada no documento inicial teve a última publicação em junho de 2022.
O formato é estável, então provavelmente funciona — mas isso precisa ser testado, não
presumido. Ver ADR 0003.

## 3. Confirmar quais canais existem em disco

Alguns dados podem existir só no stream ao vivo. Antes de desenhar a análise em cima
de um canal, confirme que ele aparece na tabela de variáveis do `.ibt`.

## 4. Estratégia de downsampling e persistência

Guardar tudo cru e agregar na leitura, ou reduzir na ingestão? Decide o modelo de
dados inteiro. Ver ADR 0007 (proposto, não aceito).

Enquanto não fecha, o sistema roda com o adapter em memória: nada sobrevive a um
restart. O adapter de disco entra passando a mesma suíte de contrato que o de
memória já passa.

## 5. Modelo e custo do agente

Default atual é `gemini-2.5-flash`, escolhido por ser barato e estável — não por
medição. O SDK instalado também tipa `gemini-3.5-flash` e `gemini-3-flash-preview`.
Falta: medir custo por análise, comparar qualidade e definir teto de gasto.

## 6. Parser de YAML da session info

O YAML da iRacing tem valores não citados que quebram parser estrito. Falta escolher
a lib e a estratégia de tolerância.

## 7. Detecção de setor

Comparação por setor é mais legível que delta contínuo, mas exige saber onde estão os
setores da pista. Verificar se a session info traz isso ou se precisa ser derivado.

## 8. Nuvem: Postgres, migrations e autenticação de verdade

`adapter-postgres` é esqueleto e a cloud-api não persiste nada ainda. Falta:
migrations, o middleware que lê o cookie selado e põe o `pilotId` na requisição,
cadastro de piloto e a rota que recebe a sessão publicada pelo desktop.

Quando existir Postgres no CI, o adapter roda a mesma suíte de contrato que o de
memória e o de SQLite já passam.

## 9. Apagar na nuvem o que foi apagado no desktop

Apagar sessão no desktop não apaga da nuvem. Isso **não** é problema de
sincronização — divergência entre os dois lados é aceitável por design (ADR
0017). É o piloto retirando algo que publicou, e precisa existir.

O resto da divergência (sessão reprocessada local que não voltou para a nuvem)
fica como está: a web pode mostrar a versão antiga sem prejuízo.

## 10. Gráficos e UX do desktop

O que o piloto vê é o produto: gráfico de canal com zoom, delta contra a
referência, navegação entre voltas, e o relatório do agente ancorado no trecho.
Nada disso começou. Usar a skill `dataviz` antes de escrever a primeira linha de
gráfico.

## 11. Empacotamento do desktop

`electron-builder` configurado, instalador Windows assinado e auto-update. Inclui
o rebuild nativo do `better-sqlite3` para a versão do Electron.

## ~~12. Quais canais trazem as condições da sessão~~ ✅ resolvido

Vêm do `WeekendInfo`, não das amostras: `TrackAirTemp`, `TrackSurfaceTempCrew`
(a medida que o sim mostra ao engenheiro, não a da superfície ao sol),
`TrackRelativeHumidity`, `TrackWindVel`, `TrackSkies`, e `WeekendOptions.TimeOfDay`.
O estado da borracha vem do bloco da sessão corrente
(`SessionTrackRubberState`).
