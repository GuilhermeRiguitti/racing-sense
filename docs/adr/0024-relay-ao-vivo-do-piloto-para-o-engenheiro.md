# ADR 0024 — A telemetria ao vivo do piloto chega ao engenheiro por WebSocket com salas, repassada pela api

**Status:** Aceito · 2026-09-25

## Contexto

A leitura ao vivo existe no desktop (ADR 0023). No computador de quem pilota, o
SDK entrega quase tudo que vai para o `.ibt`. No computador do engenheiro, que
assiste o carro da equipe pelo próprio sim, o iRacing só libera o que dá a quem
não está ao volante — tipicamente os canais `CarIdx*`, sem pedal nem pneu.

O piloto quer que o engenheiro veja **tudo o que ele vê do próprio carro**. Para
isso o desktop do piloto precisa mandar o dado para o desktop do engenheiro, e
nenhum dos dois tem endereço público: estão atrás do roteador de casa.

A api ainda não tem host. Até existir uma VPS, **tudo roda local**: a api na
máquina de quem desenvolve, contra um Postgres local. A api também nunca rodou
contra Postgres real (`docs/pendencias.md`, item 8).

## Decisão

### Transporte

1. **WebSocket com salas, na api**, via `@nestjs/websockets` com Socket.IO. O
   desktop do piloto entra na sala da transmissão e publica; os desktops dos
   engenheiros entram na mesma sala e recebem.
2. **A api só repassa, e repassa sem abrir.** O frame atravessa a api como bytes
   opacos: ela confere quem pode entrar na sala e entrega à sala — não grava, não
   decodifica, não recalcula (regras 6 e 11). Nenhuma tabela nova.
3. **A conexão vive no processo principal do desktop**, com o cookie do login, como
   o `fetch` da api hoje. A tela recebe pelo IPC, como recebe o ao vivo local.

### O que vai

4. **Todos os canais do carro do piloto, a cada tick do sim (60 Hz).** Nenhuma
   lista escolhida no código: o que o SDK entrega do carro do piloto, o
   engenheiro recebe.
5. **Só o carro do piloto** (ADR 0022). Os canais `CarIdx*` viajam reduzidos ao
   valor do carro do piloto (`DriverCarIdx`); o dos outros carros fica na máquina
   dele. A session info não viaja como YAML: vai o que o desktop já extrai dela
   para o próprio carro — pista, carro, condições, setores, ficha de acerto,
   limites do carro. Nome e CustID do grid nunca saem.
6. **Os ticks vão em lote, e o que se perde fica perdido.** O desktop do piloto lê
   todos os buffers mais novos que o último enviado (o sim guarda os últimos
   `numBuf`), e manda um lote a cada ~100 ms. Lote que não saiu é descartado: ao
   vivo velho não tem valor, e não há fila nem reenvio (regra 7). Buraco no
   `tickCount` mostra ao engenheiro o que faltou.

### O formato (e por que ele não entra no contrato da api)

7. **O frame se descreve sozinho, como o `.ibt`.** Ao entrar na transmissão, e
   sempre que o catálogo mudar, o piloto manda uma mensagem `catalog` (JSON:
   versão do formato, canais com nome, tipo, unidade e descrição, e o resumo da
   sessão do item 5). Depois, mensagens `frames` binárias: para cada tick, o
   `tickCount` e os valores na ordem e nos tipos do catálogo. É a mesma ideia da
   tabela de variáveis (regra 13): quem lê descobre o layout em runtime.
8. **O formato do frame mora só no desktop.** Quem escreve e quem lê é o mesmo
   aplicativo — piloto e engenheiro rodam o desktop —, e a api não abre o conteúdo.
   Então não há contrato duplicado entre aplicações: há um módulo em
   `apps/desktop/src/main/` que empacota e desempacota, testado com ida e volta.
   Engenheiro com desktop de versão de formato diferente recebe erro dizendo
   qual versão chegou e qual ele entende.
9. **O que é contrato da api fica pequeno e escrito no ADR/código da api:** os
   nomes dos eventos (entrar na sala, sair, publicar), o id da transmissão e o
   envelope `{ type, payload }`. Como o OpenAPI não descreve WebSocket, cada lado
   tem um teste contra o mesmo exemplo de envelope.

### Acesso

10. **Transmitir é escolha do piloto, a cada vez, e começa desligado** (regra 10).
    Só entra na sala quem ele convidou; sala sem acesso responde como inexistente.
    A regra de acesso fica num lugar só, como `canView`.
11. **O piloto nunca espera a rede** (regra 7). Transmitir roda em segundo plano;
    conexão caída não afeta o coach local dele.

### Onde roda

12. **O host é um endereço, não uma decisão de código.** O desktop já lê
    `TELEMETRY_API_URL`. Enquanto não houver VPS:
    - mesma máquina: dois desktops apontando para `localhost` (desenvolvimento);
    - mesma rede: o engenheiro aponta para o IP local da máquina que roda a api;
    - casas diferentes: **não funciona** até a VPS existir.

## Por quê

- Webhook exige que quem recebe tenha URL pública; os desktops não têm.
- POST a cada lote mais SSE funcionaria, mas as salas feitas à mão e um POST a
  cada 100 ms não compram nada que o WebSocket não dê.
- WebRTC direto entre os dois tira o tráfego do servidor, mas pede servidor de
  sinalização e TURN de qualquer jeito — complexidade demais para duas a quatro
  pessoas numa equipe.
- Frame opaco para a api resolve o maior custo da proposta anterior (o contrato
  duplicado fora do OpenAPI) e ainda impede, por construção, a api de passar a
  decodificar telemetria.
- Catálogo em runtime em vez de lista de canais: o conjunto muda entre carros e
  builds, e uma lista fixa no protocolo quebraria em silêncio — a mesma lição do
  decoder.

## O que se aceita perder

- **O engenheiro não vê os outros carros pela transmissão.** Diferença para "tudo
  igual ao piloto": o piloto, no sim, vê o grid; a transmissão leva só o carro
  dele. Para ver os rivais (posição, distância), o engenheiro entra na sessão
  pelo próprio sim, como espectador ou membro da equipe. Mudar isso é mudar a
  política do ADR 0022, e é a conta do piloto que está em jogo.
- **Banda.** Todos os canais do próprio carro a 60 Hz somam dezenas de KB/s por
  piloto, de subida na casa dele e multiplicado por engenheiro na VPS. O número
  real só sai com o sim aberto (item 14): o `bufLen` ao vivo ainda não foi medido.
- **Latência de ida e volta pelo servidor.** Piloto → api → engenheiro soma a rede
  duas vezes. Para engenharia de corrida, aceitável.
- **Sem VPS, sem uso real entre casas diferentes.**
- **Depende do login, que depende do Postgres.** O relay não sai antes do item 8
  das pendências: sem banco não há login, e sem login não há sala fechada.
  Transmissão sem login não entra nem como atalho de teste.
- **Engenheiro chegando no meio não vê o passado.** A api não guarda; quem entra
  vê daquele tick em diante, e o histórico da stint continua vindo do `.ibt`
  depois.

## Alternativa descartada

- **Webhook** — pelo motivo acima.
- **Mandar o buffer cru do sim, sem reempacotar.** Mais simples, mas leva os
  `CarIdx*` do grid inteiro, e a api passaria a carregar dado de outros pilotos.
- **Lista fixa de canais "que o engenheiro precisa"**, a 10–20 Hz. Mais leve, mas
  o piloto pediu tudo, e lista fixa é o que a regra 13 proíbe.
- **AsyncAPI para o formato do frame.** Resolve contrato entre aplicações
  diferentes; aqui as duas pontas são o mesmo desktop.
- **Túnel (ngrok, Cloudflare Tunnel) expondo a api local à internet** até a VPS
  chegar. Põe na internet uma api que nunca rodou contra banco real. Pode voltar
  como decisão própria se a VPS demorar.

## Sinal para reverter

- Banda medida grande demais para a subida de casa do piloto: aí taxa menor que
  60 Hz, decidida com o número na mão.
- Equipe grande o bastante para o tráfego pelo servidor pesar: WebRTC entre os
  desktops, com a api só apresentando os dois.
