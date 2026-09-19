# Fixtures de telemetria

## Regra

**Nenhum arquivo `.ibt` entra no repositório.** São binários grandes e contêm nome de
piloto e dados de sessão. O `.gitignore` bloqueia `*.ibt` e `fixtures/real/`.

## Como obter um arquivo para desenvolvimento

1. No iRacing, `Alt-L` arma a telemetria (ou ligue gravação permanente em
   `Options > Misc`).
2. Entre no carro e rode algumas voltas — 3 ou 4 já bastam para exercitar detecção de
   volta, out lap e in lap.
3. Saia da sessão. O arquivo fica em `Documentos\iRacing\telemetry\`.
4. Copie para `fixtures/real/` na sua máquina (ignorado pelo git).

Para os testes de detecção de volta, um arquivo com **reset para os boxes** no meio
vale mais que um limpo: é o caso que quebra implementação ingênua.

## Rodando os testes de integração

Ponha um arquivo em **`fixtures/real/sample.ibt`** (ou aponte a variável
`TELEMETRY_FIXTURE` para um caminho). O teste
`apps/desktop/src/main/ibt-real-file.test.ts` roda sozinho quando encontra, e
**pula** quando não encontra — nunca falha por ausência.

É esse teste que sustenta a validação dos offsets do formato: ele confere que a
contagem de amostras lidas bate com a declarada e que `LapDistPct` fica em
[0, 1]. Um byte de deslocamento derruba as duas coisas na hora.

## Fixtures sintéticas

Teste que depende de arquivo real não roda em CI. Por isso:

- **Unitário**: constrói os bytes na mão, como em
  `packages/ibt-core/src/decoder.test.ts`. Roda em qualquer lugar.
- **Integração**: lê de `fixtures/real/`. Deve ser marcado para pular quando o arquivo
  não existir, nunca falhar por ausência.

Quando o decoder estiver validado (etapa 1 do roadmap), vale gerar um `.ibt` sintético
pequeno e versionável — poucos canais, poucas amostras — para ter cobertura de
integração em CI sem dado de ninguém.
