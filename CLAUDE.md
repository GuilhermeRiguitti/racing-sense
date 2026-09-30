# CLAUDE.md

Instruções para agentes de código neste repositório. Leia antes de escrever
qualquer linha.

## O projeto

Análise agêntica de telemetria do iRacing, em três aplicações **independentes**:

| App | Framework | Onde roda | Papel |
|---|---|---|---|
| `apps/desktop` | Electron + SQLite | Windows do piloto | ingestão, análise, LLM. **Offline-first** |
| `apps/api` | NestJS + Prisma + Postgres | servidor | rede social: login, sessões publicadas, links |
| `apps/web` | Next.js | navegador | perfil, feed, voltas de outros. Fala só com a api |

**O desktop é o produto.** É o coach que o piloto deixa aberto enquanto treina:
dados sempre disponíveis, sempre atuais, bem apresentados. A web e a api são
funcionalidade extra — compartilhar volta, comparar com um amigo, perfil.

Critério para priorizar, sempre: *o piloto acabou de sair do carro e quer ver
onde perdeu tempo*. Entre melhorar o gráfico de delta e melhorar a consistência
da nuvem, **o gráfico ganha** (ADR 0017).

**E o desktop é a única origem de telemetria.** Ele lê o `.ibt` (e, na fase 2, o
SDK do iRacing). A api recebe dado **já processado**, guarda, devolve e
autentica. Ela não tem o código do decoder nem da LLM — esse código só existe
dentro de `apps/desktop` (ADR 0016 e **ADR 0020**).

**Estado: o decoder lê arquivo real.** Desde 2026-09-19 o decoder abre um `.ibt`
de verdade de ponta a ponta: header, session info, catálogo de canais montado em
runtime e amostras em streaming, com os offsets conferidos contra oito arquivos
em dois carros e duas pistas (Ferrari 296 GT3 / Road Atlanta e Mercedes-AMG GT3 /
Suzuka). O recorte de voltas, a reamostragem por distância e o downsampling
também estão de pé e conferidos contra arquivo real. A persistência local é
SQLite de verdade, guardando a amostra exatamente como o arquivo entregou (ADR
0019). A tela de análise existe: sessões, voltas com a situação de cada uma, a
sessão volta a volta (tempo, pressão, temperatura, combustível, ajustes
mexidos), e a volta em abas (pilotagem, pneus, suspensão, carro) sobre o eixo de
distância, com o delta contra a referência no topo, os trechos fora da pista
marcados, cursor sincronizado e o painel do engenheiro ao lado. A ingestão grava
também pneu, suspensão, motor, combustível e os ajustes `dc*` do carro, e guarda
a ficha de acerto da session info — nomes ainda não conferidos contra arquivo
real (`docs/pendencias.md`, item 12). A segmentação em trechos sai dos
setores que o sim declara (`SplitTimeInfo`): tempo de setor por volta, ganho ou
perda por setor contra a referência e a volta ideal. A **leitura ao vivo** começou
(ADR 0023): a memória compartilhada do SDK é lida só leitura via `koffi`, e a tela
"Ao vivo" mostra a volta em curso se desenhando (com a anterior por baixo) e cada
canal. O layout foi conferido contra o sim aberto em 2026-09-26
(`ibt/live-real-sim.test.ts`); o que falta está no item 14 de `docs/pendencias.md`.
O **overlay** existe (ADR 0025): janelas transparentes por cima do sim com
relative, classificação (marca com logo, carteira, SR, iRating, SOF), delta,
pedais, combustível, radar e bandeira — ainda não conferido contra o sim numa
sessão (item 15). O que ainda é stub é o **narrador**. A api tem schema Prisma e
rotas, mas ainda não rodou contra um Postgres real. Ver `docs/pendencias.md` e
`docs/roadmap.md`.

## Comandos

Na raiz (atalhos que delegam para cada app):

```bash
pnpm install            # instala as três, cada uma com o próprio lockfile
pnpm check              # lint + typecheck + testes das três — rode antes de dizer que terminou
pnpm typecheck / test   # tsc --noEmit / testes, em cada app
pnpm lint / lint:fix    # ESLint, em cada app
pnpm dev:desktop        # aplicativo do piloto (Electron)
pnpm dev:api            # api (NestJS), porta 4000, Swagger em /docs
pnpm dev:web            # rede social (Next.js), porta 3000
pnpm api:types          # exporta o openapi.json da api e regenera os tipos no desktop e na web
```

Em cada app, os scripts de sempre: `dev`, `build`, `test`, `typecheck`. A api
tem também `openapi`, `db:migrate`, `db:deploy` e `db:studio`.

Node 22+, pnpm 10.33.

## A estrutura (leia isto antes de criar qualquer arquivo)

**Cada aplicação é independente** (ADR 0020): o próprio `package.json`, o
próprio `pnpm-lock.yaml`, o próprio `node_modules`, o próprio `tsconfig`.
Nenhuma importa código da outra, e não existe `packages/`. Dependência nova entra
no `package.json` da app que a usa — nunca na raiz (a raiz não tem dependência
nenhuma). Cada app tem o próprio `eslint.config.js`.

**O contrato entre elas é o OpenAPI da api.** A api gera `apps/api/openapi.json`
a partir dos próprios DTOs (`@nestjs/swagger`). Desktop e web geram os tipos a
partir dele (`api-schema.d.ts`, não edite à mão) e chamam com `openapi-fetch`.
Mudou rota ou DTO na api: rode `pnpm api:types` e confira o typecheck das três.

### Onde colocar código novo

| O que você está escrevendo | Onde vai |
|---|---|
| Regra de corrida (volta, delta, compatibilidade) | `apps/desktop/src/main/domain/` — sem I/O |
| Leitura de bytes do `.ibt` | `apps/desktop/src/main/ibt/` |
| Leitura ao vivo do sim | bytes em `ibt/live.ts` (puro) e `ibt/live-memory.ts` (Windows); o serviço em `src/main/live/` |
| Overlay | regra (relative, classificação, combustível) em `domain/`; o quadro em `live/overlay-feed.ts`; janelas em `main/overlay/`; widgets em `renderer/src/overlay/` |
| Tabela ou consulta do banco local | `apps/desktop/src/main/db/local-store.ts` (+ `schema.ts`) |
| Algo que o coach faz (ingerir, comparar, analisar) | `apps/desktop/src/main/{ingestion,analysis}/` — função que recebe o `LocalStore` |
| Chamada à api a partir do desktop | `apps/desktop/src/main/cloud/` |
| Canal novo entre a tela do desktop e o processo principal | `apps/desktop/src/shared/ipc.ts` + `src/main/ipc/handlers.ts` + preload |
| Rota da api | `apps/api/src/<módulo>/` — controller, service, DTO com `@ApiProperty` e `class-validator` |
| Tabela da api | `apps/api/prisma/schema.prisma` + `pnpm --dir apps/api db:migrate` |
| Página da web | `apps/web/src/app/`; chamada à api em `apps/web/src/lib/api.ts` |

## Regras que não se quebram

Da estrutura:

1. **Nenhuma aplicação importa código de outra.** O que atravessa é HTTP, com os
   tipos gerados do `openapi.json`. Se duas apps precisam da mesma regra, ela
   mora em uma só (a que é dona do dado) — a outra pergunta por HTTP.
2. **`domain` e `ibt` do desktop são puros.** Nada de `node:*`, nada de lib, nada
   de I/O. O decoder recebe uma `ByteSource`; quem abre arquivo é `ibt-file.ts`,
   e quem abre a memória compartilhada do sim é `live-memory.ts`.
3. **Gerar e ler são separados.** Gerar análise (`requestLapAnalysis`) chama o
   modelo e grava; ler (`getLapAnalysis`) só lê. Tela que abre nunca dispara
   modelo.
4. **Tipo de biblioteca não vaza para o domínio.** `Buffer`, `Request`,
   `LanguageModel` e tipos do Prisma ficam na borda que usa a lib.
5. **Arquivos gerados não se editam à mão**: `api-schema.d.ts`,
   `apps/api/openapi.json`, `apps/api/src/generated/`.

Da topologia (ADR 0011, 0013, 0016, 0020):

6. **Só o desktop gera telemetria.** Ler `.ibt`, falar com o SDK do iRacing,
   decodificar e recortar voltas acontece **exclusivamente** em `apps/desktop`.
   A api recebe dado já processado, guarda e devolve — ela não lê arquivo, não
   decodifica e não recalcula nada (a melhor volta, por exemplo, sobe pronta).
7. **O desktop nunca espera a nuvem.** Tudo do coach — ingerir, comparar,
   narrar — roda local, sem HTTP. Publicar é enfileirar; enviar é outra função,
   em segundo plano. Falha de rede não vira erro na cara do piloto.
8. **A LLM é só do desktop**, chamada direto do processo principal. Não entra na
   api nem na web.
9. **A web só fala com a api**, nunca com a máquina do piloto, e não tem banco.
10. **Sessão nasce privada.** Como tudo sobe automaticamente, o default fechado é
    o único seguro. Acesso negado responde "não encontrada" (404), nunca "sem
    permissão" — distinguir os dois entrega que a sessão existe. A regra de
    acesso é `canView`, em `apps/api/src/sessions/visibility.ts`, e só lá.
11. **Nuvem desatualizada não é bug.** Divergência entre o banco local e o da
    nuvem é aceitável por design. **Não construa** reconciliação, versionamento
    de payload, resolução de conflito ou job de re-sincronização — se um dia
    fizer falta, é ADR novo. A única obrigação é apagar na nuvem o que o piloto
    apagou no desktop, e isso é privacidade, não sync (ADR 0017).
12. **O caminho do `.ibt` nunca sai da máquina.** Ele tem o nome de usuário do
    Windows dentro; o registro de arquivos ingeridos não é publicado.

De domínio:

13. **Nunca mantenha catálogo fixo de canais.** Ele vem da tabela de variáveis em
    runtime. Canal obrigatório é declarado na ingestão e conferido contra o
    catálogo real, falhando com o nome do canal.
14. **Session info é CP1252, não UTF-8.** UTF-8 corrompe nome com acento e passa
    despercebido até o primeiro acento aparecer.
15. **O modelo não calcula.** Delta, tempo de volta e recorte saem do domínio. O
    narrador recebe números prontos e redige.
16. **Comparação de volta é por distância (`lapDistPct`), nunca por tempo.**
17. **Só volta válida é material de análise** (ADR 0018 e 0021). Válida é
    **completa, sem box e sem corte de pista** — definição do piloto, e nada além
    dela: carro parado, tempo de volta e incidente dentro da pista não invalidam.
    `isValidLap` é a regra da comparação e da referência: qualquer marcação
    invalida, saída de pista inclusive, sem limiar de duração. Comparar ou eleger
    referência sobre volta inválida falha nomeando o motivo. A **sessão** (gráficos
    volta a volta) usa `countsForSession`, mais larga: saída de pista que o sim
    não puniu com slow down conta; box, gravação cortada e slow down não. A volta
    inválida continua gravada — é o registro do que o piloto rodou — e fica
    escondida na tela até o piloto pedir.
18. **Nenhum número arbitrado na análise.** Limiar, janela, grade, "valor
    típico" — se o número foi escolhido e não medido, ele não entra. Pior ainda
    se o efeito dele depende do que o piloto fez (onde freou, quão devagar
    passou): aí a análise erra diferente a cada volta. Marcação de volta sai de
    **fato binário do arquivo**; tempo, de contagem de amostras; gravação, do
    dado sem alteração. Antes de escrever uma constante numérica no caminho da
    análise, pergunte: isto foi medido, ou eu escolhi? (ADR 0018 e 0019)
19. **Canal discreto não se interpola.** Um terço dos canais do iRacing é
    inteiro, booleano ou bitfield. Entre a 3ª e a 4ª marcha não existe 3,5ª:
    reamostragem segura o último valor. O tipo viaja com a série (`isContinuous`).
20. **Condições da sessão viajam com a volta.** Comparar tempo sem temperatura de
    pista produz número honesto e conclusão errada.
21. **Chave de API e segredo só por variável de ambiente.** Nunca em código,
    teste, log ou commit. No desktop, `apps/desktop/.env` e
    `apps/desktop/.env.testing` **não** são versionados — é neles que moram os
    valores de verdade. **`apps/desktop/.env.testing.example` É versionado no
    git: NUNCA insira nele chave de API, token, senha ou qualquer valor
    sensível** — nem caminho de arquivo (tem o nome de usuário do Windows, regra
    12). Ele só declara as variáveis, vazias.
22. **Nenhum `.ibt` no repositório.** São grandes e contêm dados de piloto.
23. **Stub lança `NotImplementedError`** dizendo o que falta. Stub que devolve
    valor falso vira bug silencioso.
24. **Leitura curta falha alto.** Nunca devolva buffer parcial: o sintoma aparece
    longe da causa.

Da relação com o iRacing (ADR 0022):

25. **O app só lê do iRacing; nunca age sobre o sim.** Lê o `.ibt` e, na fase 2,
    o arquivo mapeado oficial do SDK. Nunca manda broadcast, simula tecla ou
    volante, lê a memória do processo do sim, injeta DLL ou captura rede. É a
    conta do piloto que está em jogo: o Termo de Uso do iRacing bane bot e
    programa que modifica o sim. Antes de mexer em SDK ao vivo, overlay, dado de
    outro piloto ou monetização, use a skill **`politica-iracing`**.

## Forma do código no desktop

Função que recebe o que precisa e faz. Sem classe, sem container de DI:

```ts
export async function ingestTelemetryFile(ctx: IngestContext, path: string): Promise<SessionId>
export function compareLapToReference(store: LocalStore, request: LapAgainstReference): LapComparison
```

O que o teste precisa trocar entra como parâmetro opcional (`open` na ingestão,
`narrate` na análise). O resto é concreto: o `LocalStore` é o SQLite de verdade,
e o teste usa `openLocalStore(':memory:')`.

Na api, o padrão do Nest: módulo, controller fino, service `@Injectable` com o
`PrismaService` injetado.

## Idioma

- Documentação, comentários, mensagens de commit e de erro: **português**.
- Código (identificadores, arquivos, rotas): **inglês**.

Nunca misture dentro de um identificador.

## Ao trabalhar no decoder

Use a skill **`ibt-format`**: offsets, tipos e roteiro de diagnóstico para quando
um valor vier absurdo. As constantes estão em
`apps/desktop/src/main/ibt/format.ts` — use-as, não redigite números.

Os offsets vêm da spec pública e da engenharia reversa da comunidade e **foram
validados contra arquivos reais em 2026-09-19** — ver `docs/formato-ibt.md`. O
teste que sustenta isso é `apps/desktop/src/main/ibt/ibt-real-file.test.ts`, que
pula quando `TELEMETRY_FIXTURE` está vazia em `apps/desktop/.env.testing`
(nenhum `.ibt` entra no repositório, regra 22). Se você mexer no decoder, aponte
a variável para um `.ibt` real antes de confiar no verde: sem fixture, os testes
provam só consistência interna.

## Ao mexer na interface do desktop

É o produto — o gráfico é o que o piloto olha depois de sair do carro. Antes de
escrever a primeira linha de gráfico, painel ou paleta, use a skill **`dataviz`**.

O renderer é um navegador sem Node: tudo que precisa de disco, rede ou chave
passa por IPC (`apps/desktop/src/shared/ipc.ts`).

**Evento é aviso, não dado.** O processo principal empurra `{ type, ids }` pelo
canal `events:desktop`; quem recebe responde **consultando de novo**. Payload de
evento nunca carrega série, volta ou relatório — senão passam a existir duas
versões da mesma verdade, e a que está na tela some no primeiro evento perdido.
Emitir evento nunca pode falhar uma operação: o emissor é `void` e engole o
próprio erro.

## Ao mexer na api

- Rota nova: DTO com `@ApiProperty` (tipo explícito em campo anulável ou array) e
  `class-validator`; resposta tipada com `@ApiOkResponse`. Depois,
  `pnpm api:types` na raiz.
- Tabela nova: `schema.prisma` e `pnpm --dir apps/api db:migrate` (precisa de
  `DATABASE_URL`).
- **Nunca use `import type` numa classe injetada ou num DTO de `@Body`/`@Query`.**
  O import de tipo apaga o metadado de decorator: a injeção quebra, ou o
  `ValidationPipe` para de validar sem avisar. `src/app.test.ts` monta a api
  para pegar isso.

## TypeScript

As três apps usam **TypeScript 6**. O 7.0 ainda não expõe a API de compilador
que o `typescript-eslint`, o Nest CLI e o `openapi-typescript` usam. Não suba
para o 7 sem conferir os três.

## Ao tomar decisão estrutural

Use a skill **`novo-adr`**. ADR sem a seção "o que se aceita perder" é
propaganda, não registro. Mudança de ideia não edita ADR antigo — escreve um novo
que o supera.

## Testes

- **O teste mora ao lado do módulo que testa**: `src/main/domain/lap.ts` →
  `src/main/domain/lap.test.ts`.
- **O que só existe para rodar teste mora em `apps/desktop/tests/`**, fora de
  `src/`: construtores de dados e fakes em `tests/support/` (importados pelos
  `*.test.ts`), o preparo do `.env.testing` em `tests/support/testing-env.ts` e
  o script que abre o app e tira prints em `tests/e2e/`. Código de produção
  nunca importa de `tests/`.
- Biblioteca: **vitest** no desktop e na api. A web ainda não tem testes.
- Domínio e decoder: chamada direta, sem mock.
- Desktop: SQLite `:memory:` real; `.ibt`, narrador e `fetch` falsos passados
  por parâmetro. Nada de mock de framework.
- Teste que precisa de `.ibt` real lê o caminho de `TELEMETRY_FIXTURE`
  (`apps/desktop/.env.testing`) e **pula** quando ela está vazia. Nunca falha
  por ausência de fixture.
- O vitest do desktop carrega só `.env.testing`, nunca o `.env` do aplicativo.
  Na primeira execução, `apps/desktop/tests/support/testing-env.ts` cria o
  `.env.testing` a partir do `.env.testing.example` e tenta preencher
  `TELEMETRY_FIXTURE` com o `.ibt` mais recente da pasta do iRacing.
- Api: regras puras testadas direto; services contra Postgres ainda pendentes
  (`docs/pendencias.md`).
- Antes de dizer que terminou: `pnpm check` verde. Se algo falhou, diga o que
  falhou.

## Commits

Conventional Commits em português:
`feat(desktop): detecta voltas com histerese na linha de chegada`

Escopos: `desktop`, `api`, `web`, `docs`, `adr`, `infra`.

## Onde ler mais

| Documento | Para quê |
|---|---|
| `docs/arquitetura.md` | as três aplicações, o contrato OpenAPI, onde mora cada coisa |
| `docs/adr/0020-aplicacoes-independentes.md` | por que não há código compartilhado, e o que se aceitou perder |
| `docs/adr/0011-topologia-tres-aplicacoes.md` | as três aplicações e a fronteira de autonomia |
| `docs/adr/0012-electron-no-desktop.md` | por que Electron, e o que custa |
| `docs/adr/0013-sincronizacao-e-visibilidade.md` | publicação automática, visibilidade e links |
| `docs/adr/0014-autenticacao-iron-session.md` | um login para desktop e web |
| `docs/adr/0016-so-o-desktop-gera-telemetria.md` | a invariante central |
| `docs/adr/0017-desktop-e-o-produto.md` | a prioridade: desktop primeiro, nuvem depois |
| `docs/adr/0018-so-volta-valida-e-material-de-analise.md` | por que qualquer saída de pista invalida a volta |
| `docs/adr/0019-grava-a-amostra-como-o-arquivo-entregou.md` | por que o banco guarda a amostra sem grade nem arredondamento |
| `docs/adr/0022-o-app-so-le-do-iracing.md` | por que o app nunca manda comando para o sim, e o que o EULA diz |
| `docs/adr/0023-leitura-ao-vivo-pela-memoria-compartilhada.md` | a leitura ao vivo: `koffi`, frame congelado, ao vivo não grava |
| `docs/adr/0024-relay-ao-vivo-do-piloto-para-o-engenheiro.md` | a transmissão do piloto para o engenheiro: salas, frame opaco, só o próprio carro |
| `docs/adr/0025-overlay-em-janelas-proprias.md` | o overlay: janelas próprias sem foco, número do sim, dado do grid só na tela do piloto |
| `docs/adr/0026-catalogo-da-data-api-pela-api.md` | logo do fabricante no repositório; a Data API do iRacing (serviço web, não o `.ibt`): só a api fala com ela |
| `docs/formato-ibt.md` | o layout binário, campo a campo |
| `docs/agente.md` | o que o agente faz e o que ele não faz |
| `docs/roadmap.md` | etapas e critério de pronto |
| `docs/pendencias.md` | o que ainda não foi decidido ou validado |
| `docs/glossario.md` | termos de telemetria de corrida |
| `docs/referencia-inicial.md` | documento que originou o projeto |
| `CONTRIBUTING.md` | ambiente e fluxo de trabalho |

## Escopo

**MVP:** ler `.ibt` em disco, recortar voltas, comparar com referência, gráficos
e relatório do agente.

**Fase 2, em andamento (ADR 0023):** leitura ao vivo pela memória compartilhada,
só para visualizar — nada do ao vivo vai para o banco; a análise continua saindo
do `.ibt`. A transmissão para o engenheiro em outra máquina está decidida no ADR
0024 (WebSocket com salas na api, frame opaco, só o carro do piloto) e espera o
login rodar contra Postgres. O overlay está decidido no ADR 0025: janelas
próprias do Electron, transparentes, sem foco nem mouse quando travadas, com o
que o SDK entrega — nada desenhado dentro do sim, nada do grid gravado ou
publicado.

**Fora do produto:** qualquer comando para o sim — broadcast, tecla simulada,
ajuste automático (regra 25, ADR 0022).

**Escopo da nuvem hoje:** a api tem cadastro, login, publicação, visibilidade e
links sobre Prisma, sem ter rodado contra Postgres real ainda. O desktop funciona
inteiro sem ela, e é onde o esforço vai (ADR 0017).
