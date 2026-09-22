# ADR 0019 — Grava a amostra como o arquivo entregou

**Status:** Aceito · 2026-09-22 · supera a parte de gravação do ADR 0007

## Contexto

O ADR 0007 foi aceito no mesmo dia, depois de medir com arquivo real, com três
decisões sobre o que se grava por volta: reamostrar numa grade de um ponto por
metro, não gravar o eixo (ele seria uma conta da grade) e gravar os valores em
`Float32`, declarando como custo uma perda de precisão.

O piloto pediu uma auditoria com um critério explícito: **nenhum número
arbitrado, nenhum parâmetro cujo efeito dependa do que o piloto fez**, e a
aplicação pronta para usar mais dos 288 canais na análise de setup. A auditoria,
feita contra os arquivos reais, reprovou as três decisões:

1. **A grade inventava marcha.** `Gear` é inteiro no arquivo, mas o domínio o
   tratava como número contínuo, e a interpolação produzia 3,66ª marcha. Numa
   volta real, 38 de 4055 pontos eram marchas que não existem. Um terço dos
   canais do iRacing é discreto (55 inteiros, 28 booleanos, 3 bitfields), então
   o problema cresceria justamente na análise de setup.
2. **A grade errava conforme a pilotagem.** A velocidade mínima de uma volta
   voltava 0,03 km/h errada, porque o ponto da grade não caía em cima da amostra
   mais lenta. O tamanho do erro depende de onde o piloto freou — exatamente o
   tipo de parâmetro que o critério proíbe.
3. **A grade dependia de dois números meus.** Um metro por ponto, e 4500 m de
   pista "típica" quando o arquivo não informasse o comprimento.

E uma afirmação do ADR 0007 era falsa: o custo declarado do `Float32` (pico de
241,10 voltando 241,09) era arredondamento na hora de imprimir. O arquivo já grava
a velocidade como `float32`; regravar como `float32` não perde um bit.

## Decisão

**O banco guarda a amostra exatamente como o arquivo entregou**, com a posição
medida de cada uma. Nada é reamostrado nem interpolado na gravação.

- Cada série carrega o **tipo** do canal (`number` contínuo; `integer`,
  `boolean`, `bitfield`, `text` discretos). Quem reamostra — na hora de comparar
  duas voltas, não de gravar — interpola o contínuo e segura o último valor do
  discreto.
- Cada array é gravado na **largura mais estreita que guarda todos os valores
  exatamente**, decidida conferindo valor a valor: `Float32` se todos
  sobrevivem sem mudar um bit, `Float64` se algum não sobrevive. É o dado que
  decide, não uma tabela de tipos mantida à mão.
- O eixo é gravado **uma vez por volta** quando os canais o compartilham —
  decidido comparando valor a valor, não presumido.

## Por quê

Porque a gravação é o único passo que não se desfaz. Um erro na análise se
corrige rodando a análise de novo; um valor alterado na gravação fica alterado,
e toda análise futura herda a alteração sem saber.

E porque é a única forma de a análise de setup entrar sem retrabalho: acrescentar
um canal é acrescentar um nome na lista da ingestão. Tipo, largura e reamostragem
já sabem lidar com qualquer um dos cinco tipos do formato.

## O que se aceita perder

**Espaço.** A grade de um ponto por metro ocupava 79 KB por volta; a amostra
bruta ocupa **146 KB** — 28 bytes por amostra, que é o eixo mais seis canais de
4 bytes, sem sobra. Cem stints de vinte voltas passam de 0,15 GB para **0,28 GB**.
Continua sendo 2,6% do que os próprios `.ibt` dessas stints ocupam em disco.

**Custo na leitura.** Quem desenha ou compara recebe a volta com seis a oito mil
pontos e reduz na hora. A redução para desenhar (min/max por balde) e a
reamostragem para comparar já existem e são baratas; o que se perde é poder
entregar a série pronta sem conta nenhuma.

## Alternativa descartada

**Manter a grade e só corrigir a marcha.** Resolveria o sintoma mais visível e
deixaria os outros dois: o erro que depende de onde o piloto freou, e os dois
números arbitrados. Seria cobrir um buraco com o outro.

**Guardar tudo em `Float64`.** Sem perda e sem decisão nenhuma, mas dobraria o
banco para guardar dígitos que o arquivo nunca teve: 197 dos 288 canais são
`float32` na origem.

## Sinal para reverter

Se o custo de reduzir na leitura aparecer na tela — o piloto sai do carro e o
gráfico demora —, o caminho é guardar a redução **além** da amostra bruta, como
cache descartável. Nunca **no lugar** dela.
