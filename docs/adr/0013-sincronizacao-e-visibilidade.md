# ADR 0013 — Publicação automática com visibilidade controlada

**Status:** Aceito · 2026-09-17
**Refinado por:** ADR 0017 — a fila existe para o dado não se perder, não para
garantir prazo: a nuvem atrasar não é incidente

## Contexto

A rede social só tem graça se houver conteúdo. Pedir que o piloto escolha, sessão
a sessão, o que enviar, garante que quase nada seja enviado — e ele perde o
histórico se trocar de máquina.

Por outro lado, telemetria diz muita coisa sobre quem pilota: quando treinou,
quanto errou, onde é lento. Subir tudo e deixar público por padrão seria expor
o piloto sem ele pedir.

## Decisão

**Sobe tudo, automaticamente. Nasce privado.**

1. Terminada a ingestão, a sessão entra numa **fila de publicação** persistida
   no SQLite local. A ingestão não espera rede.
2. Um flush em segundo plano envia o que está na fila. Falha de rede mantém a
   sessão na fila; uma sessão que falha não segura as outras.
3. No servidor, a sessão nasce com a visibilidade padrão da conta, que é
   **`private`**.
4. No painel da web, o piloto muda o que quiser:
   - `private` — só ele;
   - `unlisted` — quem tem o link (token revogável), sem aparecer em perfil ou busca;
   - `public` — aparece no perfil e no feed.
5. **As condições da sessão viajam junto** — temperatura do ar e da pista,
   horário, céu, umidade, vento.

## Por que privado por padrão

Porque o envio é automático. Quando o piloto não age para enviar, ele também não
agiu para publicar — o default fechado é o único que respeita isso. Abrir é um
clique; desfazer exposição indevida não é.

## Por que as condições são obrigatórias

Comparar volta de dois pilotos sem saber a temperatura da pista produz um
número honesto e uma conclusão errada. Dois segundos podem ser 15 °C de
diferença no asfalto. O domínio calcula o `ConditionsGap` e marca quando a
diferença é grande o bastante para explicar tempo sozinha — para a interface
dizer isso em vez de deixar o piloto se achar lento.

## O que **não** sobe

O arquivo `.ibt`. É grande, e o derivado (metadados, condições, voltas e séries
normalizadas) já contém tudo que a rede social usa. O original fica na máquina
do piloto, que continua sendo o dono do dado bruto.

## Revogar significa revogar

Voltar uma sessão para `private` fecha inclusive para quem já tinha o link. A
regra está em `canView`, no domínio, testada — senão "tornar privado" não
significaria nada.

E acesso negado responde **"não encontrada"**, nunca "sem permissão": distinguir
os dois já entrega ao curioso que a sessão existe.

## O que se aceita perder

- **Banda e armazenamento** com sessão que ninguém vai olhar.
- **Confiança na fila**: se ela se perder, aquelas sessões nunca sobem. Mitigação:
  ela é persistida junto com os dados, no mesmo banco.
- **Um caminho de exclusão a mais**: apagar local não apaga da nuvem. Isso ainda
  não existe e está em `docs/pendencias.md`.

## Alternativa descartada

**Publicar só o que o piloto marcar.** Respeitaria mais a privacidade por
construção, e esvaziaria a rede social — que é a razão da web existir. A
visibilidade padrão privada dá o mesmo resultado prático sem esvaziar o backup.
