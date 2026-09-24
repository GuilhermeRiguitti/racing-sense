# ADR 0022 — O app só lê do iRacing; nunca manda comando para o sim

**Status:** Aceito · 2026-09-24

## Contexto

O documento que originou o projeto (`docs/referencia-inicial.md`) listava na
fase 2 o "broadcast de comandos pro sim (câmera, pit, replay)", e o `CLAUDE.md`
repetia isso como "fora do MVP" — ou seja, como algo que um dia entraria. Foi um
equívoco: o piloto nunca quis que o app agisse sobre o jogo.

A dúvida que trouxe o assunto foi o risco de banimento da conta. O Termo de Uso
do iRacing (versão de 05/08/2026) diz, entre outras coisas:

- **6.1(d):** proíbe criar ou usar *"cheats, bots, 'mods', artificial
  intelligence (AI), AI models, and/or hacks, or any other non-iRacing software
  ... designed to cheat in or otherwise modify the iRacing experience"*.
- **6.1(e) e 20.1(c):** proíbe software que *"intercepts, 'mines', or otherwise
  collects information ... from or through the Sim"*; o sim vasculha a RAM atrás
  de programa não autorizado e reporta a conta.
- **6.5:** proíbe emular protocolo, capturar pacotes, adicionar componente ao
  cliente do sim.
- **4.1, 6.1(f) e 6.3:** a telemetria é "Data" do iRacing; disponibilizá-la em
  troca de algo de valor ou explorá-la comercialmente exige consentimento por
  escrito.

Na prática, o iRacing publica o SDK de memória compartilhada, grava o `.ibt` para
o piloto analisar e declara que terceiros como Atlas e MoTeC usam essa
telemetria (artigo de suporte de 2025). Apps só de leitura — Crew Chief, iOverlay,
Garage61, VRS — existem há anos sem banimento conhecido. O texto das cláusulas é
mais largo do que a prática, e a distância entre os dois é exatamente o que um
app que **age** sobre o sim atravessa.

## Decisão

O app **só lê** do iRacing, pelos canais que o iRacing oferece para isso:

1. o `.ibt` que o sim grava em `Documentos\iRacing\telemetry` (MVP);
2. na fase 2, o arquivo mapeado oficial do SDK (`Local\IRSDKMemMapFileName`),
   só leitura.

O app **nunca**:

- envia mensagem de broadcast (`irsdk_broadcastMsg`) — câmera, replay, pit,
  chat, ajuste de carro, nada;
- simula tecla, botão ou eixo de volante;
- lê a memória do processo do sim, injeta DLL ou faz hook de renderização;
- captura tráfego de rede do sim ou fala com os servidores dele fora de API
  documentada.

O broadcast sai do "fora do MVP" e vira **fora do escopo do produto**.

## Por quê

- O que o anti-cheat e as cláusulas 6.1(d) e 20.1 miram é software que altera a
  experiência no sim. Um coach que só lê e mostra depois fica do lado tolerado da
  linha; um coach que aperta botão pelo piloto fica do outro, mesmo que a
  intenção seja inocente (trocar o balanço de freio "para ajudar" é, do ponto de
  vista do iRacing, um bot).
- O piloto é quem arrisca a conta, e a conta vale mais que qualquer comodidade
  que o broadcast trouxesse.
- O produto é "ver onde perdi tempo" (ADR 0017). Nenhuma parte disso precisa
  escrever no sim.

## O que se aceita perder

- **Automação de pit e de câmera.** Estratégia de combustível que já manda o
  pedido de reabastecimento, replay que pula para a curva onde o piloto perdeu
  tempo — tudo isso o piloto faz na mão, no sim.
- **Paridade com apps que fazem broadcast.** Alguns concorrentes mandam comando
  de pit; o app não vai fazer.
- **Certeza jurídica.** Mesmo só lendo, a cláusula 6.1(e) é, ao pé da letra, larga
  o bastante para cobrir qualquer app de telemetria. A decisão reduz o risco ao
  que a comunidade inteira corre; não o zera.

## Alternativa descartada

**Manter o broadcast como fase futura, "só para câmera e replay".** São os
comandos mais inofensivos e o SDK os oferece. Descartado porque abrir a porta
para um tipo de comando é o que faz o próximo parecer pequeno, e porque nenhum
deles serve ao critério do produto.

## Sinal para reverter

Uma posição **escrita** do iRacing autorizando o comando específico — por
exemplo, um programa de parceria. Aí é ADR novo, restrito ao comando autorizado.
