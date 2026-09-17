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
