---
name: run-desktop
description: Abre o aplicativo do piloto (apps/desktop) de verdade, ingere um .ibt real numa pasta de dados temporária e tira prints da tabela de voltas e da volta contra uma referência. Use para conferir gráfico, painel ou tabela como o piloto os vê — texto sobreposto, rótulo cortado, layout quebrado — depois de mexer na interface do desktop, e quando pedirem para rodar, abrir ou tirar print do app.
---

# Abrir o desktop e tirar print

O teste prova a conta; o print prova a tela. Depois de mexer em gráfico,
tabela ou painel, abra o app e **olhe** o resultado antes de dizer que terminou.

**Diga ao piloto antes de abrir, e por quê** — é uma ação que ele não pediu.

## Como

```bash
pnpm --dir apps/desktop build     # o script abre o app compilado, não o dev server
node apps/desktop/tests/e2e/drive-app.mjs --reference 14 --lap 10
```

- `--ibt <caminho>` — o `.ibt` a abrir. Sem ele, usa `TELEMETRY_FIXTURE` do
  `apps/desktop/.env.testing` (o mesmo arquivo dos testes).
- `--reference <n>` — promove a volta `n` a referência pelo botão da tela.
- `--lap <n>` — abre a volta `n`; com `--reference`, compara contra ela.
- `--live` — abre a tela "Ao vivo" e tira `3-ao-vivo.png`. Com o sim fechado, o
  print mostra o estado "sim fechado"; com o sim numa sessão, a tabela de canais.
- `--out <pasta>` — onde ficam os prints (padrão: `%TEMP%/telemetry-shots`).

Saída: `1-sessao.png` (cabeçalho, tabela de voltas, gráficos da sessão) e, com
`--lap`, `2-volta.png` (delta, faixa de setores, canais e painel do engenheiro).
Leia os PNGs com a ferramenta de leitura de arquivo e olhe de verdade.

Escolha voltas que existam e sejam limpas: só volta válida vira referência e é
comparada (regra 17). Se o número não existir, o script falha dizendo qual.

## O que ele garante

- **O banco do piloto fica de fora.** O app sobe com `--user-data-dir` e
  `TELEMETRY_DIRECTORY` numa pasta temporária; o script confere que o
  `telemetry.db` nasceu lá antes de continuar, e apaga a pasta no fim.
- **O `.ibt` não entra no repositório** (regra 22): é copiado para a pasta
  temporária e apagado junto.

## Armadilhas já resolvidas no script

- **Terminal do VS Code:** o ambiente traz `ELECTRON_RUN_AS_NODE=1`, e o
  Electron sobe como Node puro (`bad option: --remote-debugging-port`). O script
  tira a variável só do processo do app.
- **Electron 44 e Playwright:** o `_electron.launch` do Playwright não conecta
  (estoura o tempo). O script sobe o Electron com `--remote-debugging-port` e
  conecta por `chromium.connectOverCDP`.
- **Sessão ingerida só aparece depois do watcher:** o script espera a lista de
  sessões antes de clicar.
