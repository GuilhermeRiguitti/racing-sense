# ADR 0015 — SQLite local e Postgres na nuvem: dois donos, não réplicas

**Status:** Aceito · 2026-09-17

## Contexto

Com o desktop autônomo (ADR 0011) e a publicação automática (ADR 0013), o mesmo
dado passa a existir em dois lugares. A pergunta é o que cada lado é dono.

## Decisão

- **SQLite, na máquina do piloto** — verdade sobre as sessões *dele*: tudo que
  foi ingerido, as séries completas, as voltas de referência e a fila de
  publicação. Funciona sem internet, que é o ponto.
- **Postgres, no servidor** — verdade sobre o que foi **publicado**: quem é o
  dono, quem pode ver, links de compartilhamento e o grafo social.

Não são réplicas. A visibilidade, por exemplo, só existe na nuvem: na máquina do
piloto ela não significa nada. E a fila de publicação só existe local.

## Por que SQLite e não arquivos

As séries crescem: uma stint de 30 min a 60 Hz passa de 100 mil pontos por canal.
Arquivo JSON por sessão obriga a ler tudo para pegar uma volta. SQLite dá leitura
parcial, transação e um arquivo só para fazer backup.

As séries ficam em coluna JSON, não em linha por ponto: o acesso é sempre "me dá
a série inteira desta volta", e linha por ponto viraria milhões de linhas para
ganhar uma consulta que ninguém faz.

## O que se aceita perder

- **Os dois podem divergir.** Sessão apagada local continua publicada; sessão
  publicada e depois editada local não volta atrás. Hoje não há reconciliação, e
  isso está em `docs/pendencias.md`.
- **`better-sqlite3` é nativo**, e precisa de rebuild por versão do Electron.
- **Dois esquemas para evoluir junto** quando o modelo mudar.

## O que segura isso de pé

As duas pontas implementam **portas**, e o contrato delas é testado pela mesma
suíte (`@telemetry/application/testing`). O adapter em memória, o de SQLite e o
de Postgres passam pelos mesmos testes — é isso que permite trocar qualquer um
deles sem tocar num caso de uso.
