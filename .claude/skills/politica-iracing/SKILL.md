---
name: politica-iracing
description: O que o Termo de Uso (EULA) do iRacing permite e proíbe para um app de telemetria, e o checklist para não pôr a conta do piloto em risco de banimento. Use ao implementar a leitura ao vivo pelo SDK/memória compartilhada, overlay, qualquer interação com o processo do sim, uso de LLM durante a corrida, publicação de dados de telemetria ou de outros pilotos, integração com a Data API do iRacing, ou ao discutir monetização — e quando o usuário perguntar se algo "pode dar ban".
---

# Política do iRacing para o app

A decisão está no **ADR 0022**: o app só lê do iRacing e nunca manda comando
para o sim. Esta skill é a referência para aplicar a decisão.

## A linha

| Lado tolerado (o que Crew Chief, iOverlay, Garage61, MoTeC fazem) | Lado proibido |
|---|---|
| Ler o `.ibt` em `Documentos\iRacing\telemetry` | Ler a memória do processo do sim (`ReadProcessMemory`) |
| Ler o arquivo mapeado oficial `Local\IRSDKMemMapFileName` | Injetar DLL, fazer hook de DirectX/renderização |
| Overlay em **janela própria** transparente, por cima do sim | Overlay desenhado dentro do sim por injeção |
| Análise e fala do coach a partir do que foi lido | Broadcast (`irsdk_broadcastMsg`): pit, câmera, replay, chat, ajuste |
| Dado do próprio piloto publicado por ele | Simular tecla, botão ou eixo de volante |
| | Capturar pacotes de rede do sim, emular protocolo |
| | Contornar canal que o iRacing esconde ao vivo de propósito |

Na dúvida: **o app age sobre o sim, ou só observa?** Se age, não entra.

## As cláusulas (EULA de 05/08/2026)

Fonte: <https://www.iracing.com/terms-use-eula/> (o PDF linkado ali). Confira a
data: o iRacing atualiza o documento, e o texto abaixo pode ter mudado.

- **4.1** — *"any and all data and statistics generated ... as a result of your
  use of the Service (the 'Data')"* pertencem ao iRacing. Telemetria é "Data".
- **6.1(d)** — proíbe *"cheats, bots, 'mods', artificial intelligence (AI), AI
  models, and/or hacks, or any other non-iRacing software ... designed to cheat
  in or otherwise modify the iRacing experience"*. A LLM do app só lê números
  prontos e redige; não altera o sim.
- **6.1(e)** — proíbe software que *"intercepts, 'mines', or otherwise collects
  information (including the Data) from or through the Service"*. Ao pé da letra
  pegaria qualquer app de telemetria; na prática o iRacing publica o SDK e grava
  o `.ibt` para isso. É o ponto cinzento que não se elimina.
- **6.1(f)** — proíbe disponibilizar o Data a terceiros *"in exchange for
  anything of value"*.
- **6.3** — proíbe explorar o Data *"for any commercial purpose ... without the
  express written consent of iRacing"*.
- **6.5** — proíbe emular protocolo, tunelar, capturar pacotes, adicionar
  componente ao cliente; conexão ao serviço só por meio aprovado.
- **6.7 e 20.1** — anti-cheat de terceiros vasculha a memória do sim; a RAM é
  monitorada atrás de programa que *"(a) enables or facilitates cheating ... (b)
  allows users to modify or hack the Sim ... (c) intercepts, 'mines,' or
  otherwise collects information from or through the Sim"*, e a detecção é
  reportada com o nome da conta.

Sinal do lado do iRacing: o artigo de suporte "2025 Season 1 Vehicle Telemetry
Update" diz que *"No changes are required for 3rd parties using the existing
telemetry system"* e cita Atlas e MoTeC como usuários dela.

## Checklist por área

**Leitura ao vivo (fase 2)**
- Abrir só o arquivo mapeado oficial, em modo leitura. Nada de handle para o
  processo do sim.
- Canal que o SDK não entrega ao vivo (o iRacing retém alguns durante a corrida)
  fica sem valor ao vivo. Não se deriva por outro caminho.

**Overlay**
- Janela separada do Electron, transparente e sempre por cima. Nunca desenhar
  dentro do sim.

**LLM**
- Recebe número pronto do domínio (regra 15) e produz texto. Nunca decide nem
  dispara ação no sim.

**Publicação e web**
- Só dado do próprio piloto. A session info traz nome e CustID do grid inteiro:
  isso não sobe, não é mostrado a terceiro e não vira ranking de outros pilotos.
- Caminho do `.ibt` nunca sai da máquina (regra 12).

**Data API do iRacing (site dos membros)**
- Hoje não é usada. Se entrar: só pelo acesso documentado e autorizado pelo
  iRacing, com a credencial do próprio piloto, nunca raspagem do site.

**Monetização**
- App gratuito compartilhando a volta do próprio piloto está no terreno do
  Garage61. Cobrar por qualquer coisa construída sobre a telemetria esbarra em
  6.1(f) e 6.3: antes de cobrar, pedir autorização **por escrito** ao iRacing e
  registrar em ADR.

## O que isto não é

Não é parecer jurídico. Se o usuário perguntar se "pode dar ban", responda com a
linha acima, cite a cláusula e diga onde está o ponto cinzento (6.1(e)); não
prometa risco zero.
