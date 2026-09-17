#!/bin/bash
# Prepara o ambiente das sessões do Claude Code na web.
# Sem isso, a sessão começa sem node_modules e `pnpm check` falha no primeiro comando.
set -euo pipefail

# Só na web. Na máquina local quem manda no ambiente é o dev.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

corepack enable >/dev/null 2>&1 || true

# O binário do Electron (~200 MB) não serve para nada numa sessão Linux: aqui só
# rodamos lint, typecheck e testes. Na máquina do dev, no Windows, ele baixa
# normalmente.
export ELECTRON_SKIP_BINARY_DOWNLOAD=1

# install (não `ci`/`--frozen-lockfile`) para aproveitar o cache do container
# entre sessões e não quebrar quando o lockfile estiver um passo atrás.
pnpm install
