# Pendências

O que ainda não foi decidido ou validado. Item resolvido sai daqui e vira ADR ou
código — esta lista não é histórico.

## 1. Validar o layout do formato contra um `.ibt` real ⚠️ bloqueia tudo

Os offsets em `packages/ibt-core/src/format.ts` vêm da spec pública e da engenharia
reversa da comunidade. Os testes atuais provam apenas que o layout é **internamente
consistente** — nenhum arquivo real passou por ele.

Sintomas típicos de offset errado: `numVars` absurdo, session info vindo como lixo
binário, `bufLen` que não bate com a soma dos tamanhos dos canais.

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

## 10. O renderer não sabe quando chega sessão nova

O IPC hoje é só pergunta e resposta: a interface só vê uma sessão nova se alguém
recarregar. Como o piloto deixa o aplicativo aberto enquanto treina (ADR 0017),
a ingestão precisa **empurrar** evento para o renderer — sessão ingerida, volta
recortada, análise pronta.

É a pendência mais importante depois de validar o decoder.

## 11. Gráficos e UX do desktop

O que o piloto vê é o produto: gráfico de canal com zoom, delta contra a
referência, navegação entre voltas, e o relatório do agente ancorado no trecho.
Nada disso começou. Usar a skill `dataviz` antes de escrever a primeira linha de
gráfico.

## 12. Empacotamento do desktop

`electron-builder` configurado, instalador Windows assinado e auto-update. Inclui
o rebuild nativo do `better-sqlite3` para a versão do Electron.

## 13. Quais canais trazem as condições da sessão

`SessionConditions` está modelado (temperatura do ar e da pista, horário, céu,
umidade, vento), mas quais canais e campos do YAML preenchem cada um só se
confirma com um `.ibt` real — mesma dependência da pendência #1.
