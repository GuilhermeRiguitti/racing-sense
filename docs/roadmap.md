# Roadmap

Cada etapa só começa quando a anterior tem teste verde. O critério de pronto está
escrito — não é "achei que estava funcionando".

## Etapa 0 — Fundação ✅

Monorepo, tipagem, lint, teste, documentação, regras do agente de código.
**Pronto quando:** `pnpm check` verde. ✅

## Etapa 1 — Decoder validado

O passo que destrava todo o resto.

- [ ] Obter um `.ibt` de build recente do sim (ver `docs/fixtures.md`)
- [ ] Validar header, disk sub header e tabela de variáveis contra o arquivo real
- [ ] Decidir: `ibt-telemetry` como dependência ou decoder próprio (ADR 0003)
- [ ] Decodificar a session info (CP1252 + YAML)
- [ ] Iterar amostras em streaming, com catálogo montado em runtime

**Pronto quando:** dado um `.ibt` real, o sistema imprime pista, carro, piloto,
quantidade de amostras, duração e os primeiros 10 valores de 3 canais — e os números
batem com o que o sim mostrou na sessão.

## Etapa 2 — Voltas

- [ ] `detectLaps` com histerese na linha de chegada
- [ ] Descartar out lap, in lap e voltas cortadas pelo início/fim da gravação
- [ ] Séries por `lapDistPct`
- [ ] Downsampling que preserva picos

**Pronto quando:** a contagem e os tempos de volta batem com os do sim, incluindo
sessão com reset para os boxes.

## Etapa 3 — Referência e delta

- [ ] Importar `.ibt` e promover uma volta a referência
- [ ] Recusar comparação entre pista/carro diferentes
- [ ] Delta acumulado por distância
- [ ] Segmentação dos trechos de ganho e perda

**Pronto quando:** comparando uma volta contra ela mesma, o delta é ~0 em toda a
extensão. É o teste que pega erro de alinhamento.

## Etapa 4 — API e interface

- [ ] Watcher ligado à API (file-lock resolvido)
- [ ] Rotas de sessão, voltas e comparação saindo do 501
- [ ] Gráficos de canal e de delta no front

**Pronto quando:** rodar uma sessão no sim e, sem tocar em nada, ver a volta aparecer
na tela.

## Etapa 5 — Agente

- [ ] Ferramentas ligadas à análise
- [ ] Relatório validado contra `agentReportSchema`
- [ ] Custo por análise medido e registrado

**Pronto quando:** o relatório aponta um trecho real de perda de tempo que se confirma
olhando o gráfico — e não inventa nenhum número.

## Fase 2 — Telemetria ao vivo

Fora do escopo atual. O que já está preparado: o decoder é puro e a origem dos bytes é
injetada, então entra uma `ByteSource` nova sobre a memória compartilhada e o resto
não muda. Custo real dessa fase: addon nativo, node-gyp, VS Build Tools, Windows x64 e
CI que não testa essa parte. Ver `docs/formato-ibt.md`.
