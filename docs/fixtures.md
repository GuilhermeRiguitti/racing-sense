# Fixtures de telemetria

## Regra

**Nenhum arquivo `.ibt` entra no repositório.** São binários grandes e contêm nome de
piloto e dados de sessão. O `.gitignore` bloqueia `*.ibt`.

## Como obter um arquivo para desenvolvimento

1. No iRacing, `Alt-L` arma a telemetria (ou ligue gravação permanente em
   `Options > Misc`).
2. Entre no carro e rode algumas voltas — 3 ou 4 já bastam para exercitar detecção de
   volta, out lap e in lap.
3. Saia da sessão. O arquivo fica em `Documentos\iRacing\telemetry\`.

Não precisa copiar para dentro do repositório: o teste lê o arquivo onde ele está.

Para os testes de detecção de volta, um arquivo com **reset para os boxes** no meio
vale mais que um limpo: é o caso que quebra implementação ingênua.

## Rodando os testes de integração

O caminho do arquivo vem de `TELEMETRY_FIXTURE`, em **`apps/desktop/.env.testing`**
(não versionado). Na primeira execução dos testes, `apps/desktop/tests/support/testing-env.ts`
cria esse arquivo a partir de `.env.testing.example` e preenche a variável com o `.ibt`
mais recente de `Documentos\iRacing\telemetry`. Se não achar, ou se o arquivo
escolhido for curto demais, preencha à mão:

```
TELEMETRY_FIXTURE=C:/Users/<você>/Documents/iRacing/telemetry/<arquivo>.ibt
```

O teste `apps/desktop/src/main/ibt/ibt-real-file.test.ts` roda quando a variável tem
valor e **pula** quando está vazia — nunca falha por ausência. Caminho preenchido e
arquivo que não abre falha alto, com o caminho na mensagem.

O arquivo exige ao menos duas voltas, uma delas completa: sessão de poucos segundos
não serve.

Para rodar contra um arquivo sem mexer no `.env.testing`, a variável do terminal
vence a do arquivo:

```bash
TELEMETRY_FIXTURE="C:/Users/<você>/Documents/iRacing/telemetry/<arquivo>.ibt" pnpm --dir apps/desktop test
```

É esse teste que sustenta a validação dos offsets do formato: ele confere que a
contagem de amostras lidas bate com a declarada e que `LapDistPct` fica em
[0, 1]. Um byte de deslocamento derruba as duas coisas na hora.

## Fixtures sintéticas

Teste que depende de arquivo real não roda em CI. Por isso:

- **Unitário**: constrói os bytes na mão, como em
  `apps/desktop/src/main/ibt/decoder.test.ts`. Roda em qualquer lugar.
- **Integração**: lê o caminho de `TELEMETRY_FIXTURE`. Deve pular quando a variável
  estiver vazia, nunca falhar por ausência.

Quando o decoder estiver validado (etapa 1 do roadmap), vale gerar um `.ibt` sintético
pequeno e versionável — poucos canais, poucas amostras — para ter cobertura de
integração em CI sem dado de ninguém.
