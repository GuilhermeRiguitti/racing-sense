# A camada agêntica

## O que o agente é

Um engenheiro de pista que lê números já calculados e explica o que eles significam.

O que ele **não** é: um calculador de delta, um parser, nem um sistema que "olha a
telemetria bruta". Todo número que ele cita saiu de `@telemetry/analysis`.

## Por que assim

| Se o modelo calculasse | Com a análise determinística |
|---|---|
| Erro de conta sem sintoma visível | Conta testável com fixture |
| ~100 mil pontos por canal no prompt | Dezenas de números por pergunta |
| Resposta não reproduzível | Mesmos dados, mesma base factual |
| Custo alto por análise | Custo baixo, modelo barato dá conta |

É também o que permite usar modelo barato (Gemini Flash, Llama via NIM) sem perder
qualidade: a parte difícil não é raciocínio numérico, é redação técnica com contexto.

## Stack

**AI SDK da Vercel (`ai` v7)** como camada de modelo. Ver
`docs/adr/0005-camada-agentica-ai-sdk.md` para a comparação com Mastra e o critério
de quando migrar.

Providers no MVP:

| Provider | Pacote | Variável de ambiente | Default |
|---|---|---|---|
| `google` | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-flash` |
| `nvidia` | `@ai-sdk/openai-compatible` | `NVIDIA_API_KEY` | `meta/llama-3.3-70b-instruct` |

Troca de provider é variável de ambiente (`TELEMETRY_LLM_PROVIDER`), não mudança de
código. O único arquivo que sabe qual provider está em uso é
`packages/agent/src/provider.ts`.

## Ferramentas

O agente não recebe a telemetria no prompt. Ele pede o que precisa:

| Ferramenta | Devolve |
|---|---|
| `listLaps` | voltas da sessão com tempo e validade |
| `getLapSummary` | tempo, setores, mín/máx dos canais principais |
| `getDeltaSegments` | trechos onde o delta contra a referência se move |
| `getChannelWindow` | canais num trecho de distância, já reduzidos (teto de pontos) |

Regras das ferramentas:

1. Toda ferramenta tem teto de pontos. Nenhuma devolve série crua.
2. Toda ferramenta é determinística: mesma entrada, mesma saída.
3. Nenhuma ferramenta escreve. O agente não ingere arquivo, não apaga sessão, não
   altera referência.

## Saída

Estruturada, validada contra `agentReportSchema` (`@telemetry/contracts`). Cada achado
carrega o trecho (`startDistPct`/`endDistPct`), os canais que o sustentam e uma
confiança declarada. Achado sem canal de evidência é recusado na validação — é assim
que se evita conselho genérico de coach.

## Volta de referência

O sistema importa um `.ibt` só para extrair uma volta e guardá-la como referência
(`referenceLapSchema`). A comparação é sempre **por distância** (`lapDistPct`), nunca
por tempo: quem freia mais tarde desalinha todo o resto da volta no eixo do tempo.

A referência pode vir de outro piloto, de outra sessão sua, ou de uma hot lap baixada.
O que ela precisa ter: mesma pista e mesmo carro. Comparar carros diferentes produz um
delta que existe matematicamente e não significa nada — a validação recusa.

## Custo e privacidade

- Nenhum arquivo `.ibt` sai da máquina. O que vai para o provedor é o resumo numérico
  pedido pelas ferramentas mais o prompt.
- Nome de piloto é dado pessoal. Antes de mandar session info para o modelo, remova o
  que não for necessário para a análise.
- Chave de API só por variável de ambiente. Nunca no código, nunca em teste, nunca no
  commit.

## Pendências

Ver `docs/pendencias.md`: escolha final do modelo (medir custo/qualidade), estratégia
de avaliação das respostas e limite de gasto por análise.
