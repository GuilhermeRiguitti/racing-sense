# @telemetry/application-cloud

Os casos de uso da nuvem. **Só a cloud-api declara este pacote.**

Visibilidade, links de compartilhamento e leitura do que o desktop já publicou.
Nada aqui lê arquivo, decodifica telemetria ou chama modelo — a nuvem recebe
dado pronto, guarda e devolve (ADR 0016).

## O que tem

```
src/
  commands/   mudar visibilidade · compartilhar · revogar link
  queries/    abrir sessão publicada · listar públicas
  ports/      armazenamento das sessões publicadas · gerador de token
  testing/    suíte de contrato do armazenamento publicado
```

## A regra de acesso não mora aqui

Quem decide quem pode ver é `canView`, no `@telemetry/domain`: uma função pura,
testada, usada igual pelo servidor e por qualquer outro lugar que precise. O que
esta camada acrescenta é a tradução — **acesso negado responde "não
encontrada"**, nunca "sem permissão", porque distinguir os dois já entrega ao
curioso que a sessão existe.
