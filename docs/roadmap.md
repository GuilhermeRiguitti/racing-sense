# Roadmap

Cada etapa só começa quando a anterior tem teste verde. O critério de pronto está
escrito — não é "achei que estava funcionando".

## A ordem de prioridade

**O aplicativo do desktop é o produto** (ADR 0017). O critério para decidir o que
vem primeiro é sempre o mesmo: *o piloto acabou de sair do carro e quer ver onde
perdeu tempo*. O que serve a esse momento ganha.

A web e a cloud-api são funcionalidade extra, para depois — compartilhar uma
volta, comparar com um amigo, ter perfil. Entre melhorar o gráfico de delta e
melhorar a consistência da nuvem, o gráfico ganha.

## Etapa 0 — Fundação ✅

Monorepo, camadas (hexagonal + CQS), tipagem, lint, teste, verificação de
fronteiras, documentação e regras do agente de código.
**Pronto quando:** `pnpm check` verde. ✅

## Etapa 1 — Decoder validado

O passo que destrava todo o resto.

- [x] Obter um `.ibt` de build recente do sim (ver `docs/fixtures.md`)
- [x] Validar header, disk sub header e tabela de variáveis contra o arquivo real
- [x] Decodificar a session info (CP1252 + YAML)
- [x] Iterar amostras em streaming, com catálogo montado em runtime
- [x] Decidir: decoder próprio (ADR 0003 — o `ibt-telemetry` deixou de ser
      necessário, porque o nosso passou no arquivo real)

**Pronto quando:** dado um `.ibt` real, o sistema imprime pista, carro, piloto,
quantidade de amostras, duração e os primeiros 10 valores de 3 canais — e os números
batem com o que o sim mostrou na sessão.

## Etapa 2 — Voltas

- [x] `detectLaps` com histerese na linha de chegada (`packages/domain`)
- [x] Marcar out lap, in lap, saída de pista, incidente, teleporte e volta
      cortada pelo início/fim da gravação (marcar, não descartar: a volta suja
      tem conteúdo, só não pode ser referência)
- [x] Séries por `lapDistPct`, com a grade em um ponto por metro (medida, não
      arbitrada — ver `docs/pendencias.md` #4)
- [x] Downsampling que preserva picos (min/max por balde)

**Pronto quando:** a contagem e os tempos de volta batem com os do sim, incluindo
sessão com reset para os boxes.

## Etapa 3 — Referência e delta

- [ ] Importar `.ibt` e promover uma volta a referência
- [ ] Recusar comparação entre pista/carro diferentes
- [ ] Delta acumulado por distância
- [ ] Segmentação dos trechos de ganho e perda

**Pronto quando:** comparando uma volta contra ela mesma, o delta é ~0 em toda a
extensão. É o teste que pega erro de alinhamento.

## Etapa 4 — O aplicativo do piloto de pé

A etapa que entrega o produto.

- [x] Watcher ligado à ingestão (file-lock resolvido, em `adapter-fs`)
- [x] IPC empurrando evento para o renderer: sessão ingerida, análise pronta,
      publicação — com a interface consultando de novo em vez de confiar no payload
- [ ] Gráfico de canal com zoom e navegação entre voltas
- [ ] Gráfico de delta contra a referência
- [x] Persistência local passando a suíte de contrato das portas (SQLite,
      séries em binário — ADR 0007)

**Pronto quando:** rodar uma sessão no sim, com o aplicativo aberto, e a volta
aparecer na tela sozinha — sem clicar em nada.

Antes de escrever a primeira linha de gráfico, use a skill `dataviz`.

## Etapa 5 — Agente

- [ ] `NarratorPort` implementada de verdade em `adapter-llm`
- [ ] Relatório validado contra `analysisReportDto`
- [ ] Custo por análise medido e registrado

**Pronto quando:** o relatório aponta um trecho real de perda de tempo que se confirma
olhando o gráfico — e não inventa nenhum número.

## Depois — a parte social

A cloud-api e a web saem do esqueleto: receber a sessão publicada, Postgres com
migrations, autenticação ligada, painel de visibilidade e feed. Nada disso
bloqueia o desktop, e o desktop funciona inteiro sem nada disso.

## Fase 2 — Telemetria ao vivo

Fora do escopo atual. O que já está preparado: o decoder é puro e a origem dos bytes é
injetada, então entra uma `ByteSource` nova sobre a memória compartilhada e o resto
não muda. Custo real dessa fase: addon nativo, node-gyp, VS Build Tools, Windows x64 e
CI que não testa essa parte. Ver `docs/formato-ibt.md`.
