# @telemetry/application-desktop

Os casos de uso do aplicativo do piloto. **Só o desktop declara este pacote.**

É aqui que vive tudo que toca em telemetria: ingerir o `.ibt`, decodificar,
recortar voltas, comparar com a referência, pedir a análise ao narrador e
enfileirar a publicação.

## Por que isso é um pacote separado

Porque telemetria só nasce no desktop (ADR 0016). Como a cloud-api não declara
este pacote, o pnpm nem o instala para ela: um import da ingestão falha na
resolução, antes de qualquer revisão de código. Não é convenção — é o build.

## O que tem

```
src/
  commands/   ingerir arquivo · importar referência · pedir análise · esvaziar fila
  queries/    listar sessões e voltas · comparar com referência · ler análise
  ports/      arquivo · decoder · watcher · stores locais · narrador · publicação · identidade
  testing/    suítes de contrato das portas de armazenamento local
```

## A porta que importa mais

`TelemetryFilePort` é o ponto de troca entre o MVP e a fase 2: hoje um adapter
lê arquivo em disco; amanhã outro lê a memória compartilhada do sim. Nenhum caso
de uso deste pacote muda quando isso acontecer.
