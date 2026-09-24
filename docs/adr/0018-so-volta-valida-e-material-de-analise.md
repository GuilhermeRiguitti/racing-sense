# ADR 0018 — Só volta válida é material de análise

**Status:** Aceito · 2026-09-19 · Superado em parte por ADR 0021 (saída de pista sem punição conta na sessão)

## Contexto

O recorte de voltas (ADR nenhum, etapa 2 do roadmap) marca cada volta com o que
aconteceu nela: passou pela box, saiu da pista, o sim contou incidente, houve
teleporte, ou a gravação a cortou pela metade.

Sobrou decidir o que fazer com a volta marcada. A pergunta não é acadêmica: nos
oito arquivos reais que temos — quatro em Road Atlanta, quatro em Suzuka —
**nenhuma volta está limpa**. Todas têm pelo menos um toque fora dos limites.

O sim não ajuda a decidir. Ele cronometrou uma volta com 3,58 s fora da pista e
2 incidentes, e se recusou a cronometrar outra com 5,32 s e 3 incidentes. A regra
que ele usa não se deduz de dois casos, e pode nem ser sobre gravidade — pode ser
configuração da sessão.

## Decisão

**Volta com qualquer marcação não é material de análise.** Saída de pista basta
para invalidar; não existe toque tolerável, nem limiar de duração.

Na prática:

- `isValidLap` é a única regra, e é `flags.length === 0`;
- pedir análise, comparar com referência ou eleger referência sobre volta
  inválida falha nomeando o motivo, em vez de produzir número;
- a volta inválida continua **gravada e listada** — ela é o registro do que o
  piloto rodou, e apagá-la seria destruir dado do usuário. O que ela não é:
  entrada de análise.

## Por quê

Telemetria de volta suja mede outra coisa. Uma saída de pista muda velocidade de
entrada, carga do pneu e linha do resto do setor — o delta contra a referência
passa a somar "erro" com "estilo" sem dizer qual é qual. O número sai honesto e a
conclusão sai errada, que é o pior dos dois mundos.

E o custo dos dois erros não é simétrico. Recusar uma volta boa é visível: o
piloto percebe na hora e reclama. Aceitar uma volta suja como referência é
invisível: todas as comparações seguintes ficam deslocadas e ninguém descobre.
Entre um erro que aparece e um que não aparece, o certo é escolher o que aparece.

O limiar por duração foi descartado por não ter em que se apoiar. Qualquer número
— 0,5 s, 1 s, 2 s — seria escolhido por dois pontos de dado, e apareceria no
código como se fosse conhecimento. Zero não precisa de calibração.

## O que se aceita perder

Com os arquivos de hoje, **o sistema não tem nenhuma volta para analisar**. A
funcionalidade existe e não roda, até chegar uma stint limpa.

Isso é aceito de propósito: o problema é da gravação, não do critério. O piloto
que quiser análise precisa de uma volta que ele mesmo consideraria boa — e se ele
não tem nenhuma, essa é a informação mais útil que o sistema pode dar hoje.

Também se perde a análise de volta "quase boa" — aquela com um toque de zebra a
250 km/h que não custou tempo nenhum. Ela vira inválida junto com a rodada de
três segundos, e a marcação não distingue as duas.

## Alternativa descartada

**Limiar de gravidade** — só invalida acima de X segundos fora, ou acima de Y
incidentes. Descartada pelo motivo acima: não há dado para calibrar X nem Y, e um
número inventado no código é pior que um critério estrito, porque parece
fundamentado.

**Escolha na mão, com aviso na tela** — o piloto elege a referência e o sistema
só avisa que ela está suja. Descartada porque transfere para o piloto uma decisão
que ele não tem como avaliar: ele veria "3,6 s fora da pista" sem saber se isso
contamina o delta em 2 centésimos ou em 8 décimos.

## Sinal para reverter

Se, com uma stint limpa em mãos, o critério estrito continuar rejeitando voltas
que o piloto considera boas — em especial toque curto de zebra sem perda de tempo
— aí existe dado para calibrar um limiar, e a decisão vira outro ADR. O sinal é
esse: **dado para calibrar**, não incômodo com a recusa.
