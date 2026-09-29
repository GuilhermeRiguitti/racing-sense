# Roadmap

Cada etapa só começa quando a anterior tem teste verde. O critério de pronto está
escrito — não é "achei que estava funcionando".

## A ordem de prioridade

**O aplicativo do desktop é o produto** (ADR 0017). O critério para decidir o que
vem primeiro é sempre o mesmo: *o piloto acabou de sair do carro e quer ver onde
perdeu tempo*. O que serve a esse momento ganha.

A web e a api são funcionalidade extra, para depois — compartilhar uma
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

- [x] `detectLaps` com histerese na linha de chegada (`apps/desktop/src/main/domain`)
- [x] Marcar out lap, in lap, saída de pista, incidente e volta
      cortada pelo início/fim da gravação (marcar, não descartar: a volta suja
      tem conteúdo, só não pode ser referência)
- [x] Séries por `lapDistPct`: gravadas como o arquivo entregou, reamostradas só
      para comparar, sem interpolar canal discreto (ADR 0019)
- [x] Downsampling que preserva picos (min/max por balde)

**Pronto quando:** a contagem e os tempos de volta batem com os do sim, incluindo
sessão com reset para os boxes.

## Etapa 3 — Referência e delta

- [x] Importar `.ibt` e promover uma volta a referência (comando, IPC e botão
      na tela)
- [x] Recusar comparação entre pista/carro diferentes
- [x] Delta acumulado por distância — sem grade: avaliado nas posições que a
      volta amostrou, tempo pela contagem de ticks
- [x] Segmentação dos trechos de ganho e perda — pelos setores que o sim declara
      (`SplitTimeInfo`), conferidos contra arquivo real; cortar por "mudança
      sustentada" do delta exigiria limiar

**Pronto quando:** comparando uma volta contra ela mesma, o delta é ~0 em toda a
extensão. É o teste que pega erro de alinhamento.

## Etapa 4 — O aplicativo do piloto de pé

A etapa que entrega o produto.

- [x] Watcher ligado à ingestão (file-lock resolvido; arquivo criado durante a varredura inicial também entra)
- [x] IPC empurrando evento para o renderer: sessão ingerida, análise pronta,
      publicação — com a interface consultando de novo em vez de confiar no payload
- [x] Gráfico de canal por distância, com cursor sincronizado entre os painéis e
      leitura pelo teclado; navegação entre sessões e voltas
- [ ] Zoom num trecho da volta
- [x] Marcar no gráfico onde a volta saiu da pista (trechos gravados com a volta)
- [x] Gráfico de delta contra a referência, com a referência por baixo da volta
- [x] Painel do engenheiro: pneu por roda (externa/meio/interna, pressão,
      desgaste), combustível e voltas no tanque, ajustes de dentro do carro,
      dinâmica e motor — média da volta ou valor no cursor
- [x] A sessão volta a volta: tempo, pressão, temperatura e combustível por
      volta, e quando o piloto mexeu em cada ajuste
- [x] Ficha de acerto do carro, como o sim a declarou
- [x] Persistência local em SQLite (amostra bruta sem perda — ADR 0019)

**Pronto quando:** rodar uma sessão no sim, com o aplicativo aberto, e a volta
aparecer na tela sozinha — sem clicar em nada.

Antes de escrever a primeira linha de gráfico, use a skill `dataviz`.

## Etapa 5 — Agente

- [ ] Narrador implementado de verdade (`apps/desktop/src/main/analysis/narrator.ts`)
- [ ] Relatório validado contra o formato de `AnalysisReport`
- [ ] Custo por análise medido e registrado

**Pronto quando:** o relatório aponta um trecho real de perda de tempo que se confirma
olhando o gráfico — e não inventa nenhum número.

## Depois — a parte social

A api já recebe a sessão publicada, com Prisma, migration inicial, cadastro e
login (ADR 0020). Falta rodar contra Postgres de verdade, o painel de
visibilidade na web e o feed com gráfico. Nada disso
bloqueia o desktop, e o desktop funciona inteiro sem nada disso.

## Fase 2 — Telemetria ao vivo

Começou (ADR 0023). A leitura da memória compartilhada está de pé via `koffi`,
sem addon compilado: `ibt/live-memory.ts` abre o arquivo mapeado só leitura,
`ibt/live.ts` congela o frame e decodifica com o mesmo catálogo em runtime do
`.ibt`. A tela "Ao vivo" mostra cada canal que o sim entrega e se ele está
mudando.

Próximos passos, nesta ordem:

1. Conferir contra o sim aberto e anotar o que fica parado em cada posição
   (`docs/pendencias.md`, item 14).
2. Gráfico ao vivo dos canais que o piloto olha (velocidade, pedais, marcha) sobre
   a volta corrente, por distância.
3. Decidir, em ADR, se e como a telemetria do piloto chega ao engenheiro em outra
   máquina.

**Pronto quando:** com o sim numa sessão, o piloto (ou o engenheiro) vê a volta
corrente se desenhar enquanto ela acontece, e os números batem com o `.ibt` da
mesma volta depois de ingerido.

A fase 2 continua só de leitura: o arquivo mapeado oficial do SDK, nada de
comando para o sim (ADR 0022).
