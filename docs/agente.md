# A camada agêntica

## O que o agente é

Um engenheiro de pista que lê números já calculados e explica o que eles significam.

O que ele **não** é: um calculador de delta, um parser, nem um sistema que "olha a
telemetria bruta". Todo número que ele cita saiu de `@telemetry/domain`.

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

**AI SDK da Vercel (`ai` v7)**, dentro de `packages/adapter-llm` — único pacote
do sistema que importa `ai` ou `@ai-sdk/*`. Ver
`docs/adr/0005-camada-agentica-ai-sdk.md` para a comparação com Mastra e o critério
de quando migrar.

Providers no MVP:

| Provider | Pacote | Variável de ambiente | Default |
|---|---|---|---|
| `google` | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-flash` |
| `nvidia` | `@ai-sdk/openai-compatible` | `NVIDIA_API_KEY` | `meta/llama-3.3-70b-instruct` |

Troca de provider é variável de ambiente (`TELEMETRY_LLM_PROVIDER`), não mudança de
código. O único arquivo que sabe qual provider está em uso é
`packages/adapter-llm/src/provider.ts`.

## A porta

A aplicação conhece uma interface só, `NarratorPort`:

```ts
narrate(request: { comparison: LapComparison; evidence: ReadonlyMap<string, readonly number[]> }): Promise<Narration>
```

Entra delta já calculado mais trechos de canal já reduzidos; sai resumo e
achados. Nenhum tipo do AI SDK aparece na assinatura — é isso que permite trocar
a biblioteca sem tocar em caso de uso (ADR 0009).

Se um dia o narrador precisar buscar dados por conta própria (tool calling), ele
recebe **portas de leitura** — nunca escrita, e nunca acesso a arquivo. O teto de
pontos por trecho continua valendo: nenhuma série crua vai para o modelo.

## O que o agente não pode fazer

1. Ingerir arquivo, apagar sessão ou alterar referência. O narrador só lê.
2. Receber série crua. Tudo que chega já passou por redução.
3. Calcular. Se um número não veio do domínio, ele não entra no relatório.

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
