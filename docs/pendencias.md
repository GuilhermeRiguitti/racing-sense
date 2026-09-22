# Pendências

O que ainda não foi decidido ou validado. Item resolvido sai daqui e vira ADR ou
código — esta lista não é histórico.

A numeração é estável: item que sai não faz os outros andarem, para referência de
fora não apontar para o lugar errado.

## 5. Modelo e custo do agente

Default atual é `gemini-2.5-flash`, escolhido por ser barato e estável — não por
medição. O SDK instalado também tipa `gemini-3.5-flash` e `gemini-3-flash-preview`.
Falta: medir custo por análise, comparar qualidade e definir teto de gasto.

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
