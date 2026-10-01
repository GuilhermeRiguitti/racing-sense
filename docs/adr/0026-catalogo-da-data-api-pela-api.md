# ADR 0026 — A logo do fabricante mora no repositório; a Data API do iRacing entra só pela api, para catálogo e mapa da pista

**Status:** Aceito · 2026-09-30 · implementação espera o item 8 e o item 16 de
`docs/pendencias.md`

## Antes de ler: dois "iRacing" diferentes

Este ADR fala de **duas fontes do iRacing que não têm nada em comum**, e é fácil
misturar:

| | `.ibt` e SDK ao vivo | Data API |
|---|---|---|
| O que é | arquivo que o sim grava e memória compartilhada que ele publica | serviço web do site de membros, `members-ng.iracing.com/data` |
| Onde está | na máquina do piloto | na internet |
| Credencial | nenhuma | OAuth2 com Client ID e Client Secret concedidos pelo iRacing |
| O que entrega | telemetria: canais, amostras, session info | catálogo (carros, pistas, imagens), resultados, estatística de membro, calendário. **Nada de telemetria** |
| Quem lê | **só o desktop** (regra 6, ADR 0016 e 0023) | **só a api** (este ADR) |

Nada aqui muda a primeira coluna. "O desktop não fala com o iRacing", neste ADR,
quer dizer "o desktop não fala com a **Data API**" — com o `.ibt` e o SDK ele
continua falando como sempre.

## Contexto

O overlay mostra a marca do carro (ADR 0025, item 6). A session info não tem
campo de fabricante: traz `CarID`, `CarPath` (`ferrari296gt3`), `CarScreenName` e
a classe. A marca sai do nome, contra a lista `MAKES` em
`apps/desktop/src/main/domain/driver.ts` (o primeiro fabricante que aparece no
nome, como palavra inteira), e as siglas (`FER`, `AMG`) são invenção nossa. O
piloto quer, no relative e na classificação, **só a marca, com a logo** — sem o
modelo.

A Data API tem o que falta:

- `/data/car/get`: `car_id` (o `CarID` do SDK), `car_dirpath` (o `CarPath`),
  `car_make`, `car_model`;
- `/data/car/assets`: o logotipo do fabricante e fotos do carro;
- `/data/track/assets`: o mapa da pista em SVG por camadas (traçado, pit lane,
  largada, curvas numeradas);
- e, por piloto, histórico de iRating e SR, corridas recentes, resumo de carreira.

Desde 09/12/2025 (2026 Season 1) o login por usuário e senha foi desligado. O
único acesso é OAuth2, e o Client ID e o Client Secret são **concedidos pelo
iRacing, por pedido**. Há dois fluxos: *Password Limited*, para script e servidor,
e *Authorization Code*, para app distribuído em que o usuário autoriza.

Os nomes de campo acima vêm das bibliotecas da comunidade e ainda não foram
conferidos contra uma resposta real.

## Decisão

### A logo

1. **A logo de cada fabricante é um arquivo no repositório** (PNG pequeno ou
   SVG), em `apps/desktop/src/renderer/src/overlay/logos/<id>.png`, desenhada
   num chip claro para a logo escura não sumir no fundo do overlay. O domínio reconhece o
   fabricante e devolve um `id` estável (`ferrari`, `mercedes-amg`); o renderer
   troca o `id` pela logo (`overlay/make-logo.ts`). O domínio não sabe de
   arquivo.
2. **Fabricante sem logo aparece com a sigla**; carro sem fabricante
   reconhecido, sem nada — como antes. As logos entram aos poucos.
3. **O overlay mostra só a marca.** A coluna de modelo sai do relative, da
   classificação e da configuração.
4. **Fonte das logos**: SVG com licença clara (Simple Icons, CC0) ou o da página
   de imprensa do fabricante. Nunca copiado do site do iRacing.

### A Data API

5. **Só a `apps/api` fala com a Data API.** A credencial fica no `.env` da api
   (regra 21), nunca no desktop, na web ou no instalador.
6. **O catálogo é da api.** Um job agendado dentro da própria api (não um script à
   parte) busca carros e pistas na Data API com a credencial do projeto (fluxo
   *Password Limited*) e grava no Postgres. Da primeira vez traz tudo; depois,
   o que mudou. O catálogo é o mesmo para todo usuário, então uma credencial
   basta.
7. **A api serve o catálogo pelas próprias rotas**, no contrato OpenAPI de
   sempre (ADR 0020): mapa da pista por `TrackID` e a marca dos carros que a
   lista `MAKES` não reconhece pelo nome.
8. **O desktop baixa da api, em segundo plano, e guarda no SQLite.** O catálogo
   de carros vem inteiro (é pequeno e o overlay precisa do grid todo). O mapa vem
   só da pista em que o piloto andou, quando ele ingere uma sessão nela. A chave é
   o que o desktop já lê do `.ibt`: `CarPath` e `TrackID`. Depois de baixado, o
   desktop só lê do SQLite. A logo continua vindo do repositório (item 1), não
   da Data API.
9. **Sem catálogo, o desktop funciona igual a hoje.** Sem rede, api fora do ar,
   job que ainda não rodou ou carro lançado ontem: a marca sai da lista
   `MAKES`, a tela fica sem mapa, e tenta-se de novo depois. Nunca vira erro
   na tela (regra 7). A lista `MAKES` fica como reserva, não sai.
10. **Dado do próprio piloto (iRating, corridas recentes) é da web**, pelo fluxo
   *Authorization Code*: o piloto conecta a conta iRacing na web, e o token dele
   fica na api. Só para usuário autenticado, só o dado dele. Fica para depois do
   catálogo.

```
          Data API do iRacing (internet, OAuth2)
                      │   credencial no .env da api
                      ▼
   apps/api ── job agendado ─► Postgres (carros, pistas, mapas)
      │  rotas do catálogo (OpenAPI)
      ├──────────────► apps/web      mostra
      └──────────────► apps/desktop  baixa em segundo plano → SQLite
                            ▲
   .ibt e SDK ao vivo ──────┘   (local, sem credencial; não muda)
```

## Por quê

- **Logo no repositório não depende de ninguém.** São umas 35 marcas, uma por
  fabricante e não por carro; as 32 de hoje somam ~0,5 MB. Esperar a Data API só pela logo
  amarraria o overlay a uma credencial que pode nunca chegar.
- **A credencial não cabe no desktop.** Client Secret dentro de instalador é
  segredo publicado. Na api ele fica num `.env` de servidor, como qualquer outro.
- **A web só fala com a api** (regra 9) e não tem banco: chamando a Data API
  direto, refaria a chamada a cada página, sem cache.
- **Offline-first continua de pé.** O desktop depende do catálogo só para
  enfeitar — logotipo e mapa. O coach (ingerir, comparar, narrar) não passa por
  ele, e sem ele a tela é a de hoje.
- **Não é sincronização** (regra 11). É download de dado de referência, num
  sentido só, sempre sobrescrevendo, sem nada do piloto no meio. Não há conflito
  a resolver porque o desktop nunca escreve no catálogo.
- **Não é telemetria** (regra 6). A api continua sem ler `.ibt` nem decodificar
  nada; ela guarda e devolve um catálogo que outro serviço fornece.
- O mapa oficial da pista, com as curvas numeradas, é o que mais serve ao
  critério do produto (ADR 0017): mostrar *onde* o piloto perdeu tempo no desenho
  da pista, com o nome da curva.

## O que se aceita perder

- **Dependência de uma concessão do iRacing.** Sem Client ID, nada deste ADR
  existe, e não se sabe se nem quando o pedido é aprovado. Pode ser revogado.
- **O catálogo depende da api estar de pé.** Um piloto que instala o app e nunca
  fica online não vê logotipo nem mapa, para sempre.
- **Atraso em carro e pista novos.** Entre o lançamento no sim e o próximo job da
  api, o carro aparece com a sigla (ou sem marca), e a pista sem mapa.
- **Uma peça a mais para manter na api**: job, tabelas, token renovado, limite de
  requisição da Data API.
- **Marca registrada no pacote.** O ADR 0025 deixava a logo de fora por isso.
  Mostrar a logo para identificar o carro, num app gratuito, é o que os overlays
  conhecidos fazem; o risco se aceita. Se um fabricante pedir, o arquivo sai e
  volta a sigla. Cobrar pelo app reabre a questão.
- **Logo desatualizada.** Fabricante que muda a identidade visual fica com a
  antiga até alguém trocar o arquivo.
- **O modelo do carro some do overlay.** Num grid de GT3, "Ferrari" e não
  "Ferrari 296 GT3"; o nome inteiro fica no `title` da logo.
- **Cobrança fica mais amarrada.** Cobrar pelo desktop já exigia autorização
  escrita do iRacing (cláusulas 6.1(f) e 6.3, ADR 0022); o uso do catálogo entra
  no mesmo pedido.

## Alternativa descartada

- **Logo pela Data API.** Primeira versão deste ADR. Descartada pela dependência
  da credencial, e porque a logo muda tão pouco que um arquivo no repositório
  serve.
- **Credencial no desktop, falando direto com a Data API.** Segredo dentro do
  instalador, e cada piloto chamando o iRacing por conta própria.
- **Credencial na web.** Fere a regra 9 e não tem onde guardar o catálogo.
- **Script de desenvolvimento que gera uma constante versionada** (`CarPath →
  marca`) a partir da Data API. Precisa da mesma credencial, alguém tem que
  lembrar de rodar a cada carro novo, e não resolve o mapa da pista.
- **Entrar numa sessão com todos os carros e anotar à mão.** Trabalhoso, e a
  session info não tem o campo de fabricante de qualquer jeito.

## Sinal para reverter

- O iRacing negar ou revogar o Client ID: o desktop fica com a lista `MAKES` e sem
  mapa, e a api perde o módulo de catálogo.
- O SDK passar a entregar fabricante na session info: a lista `MAKES` perde a
  razão de ser, e o `id` passa a sair do `.ibt`.
- Um fabricante pedir a retirada da logo: sai o arquivo, fica a sigla.
