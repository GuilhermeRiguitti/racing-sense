# @telemetry/cloud-api

A ponte entre o aplicativo do Windows e a web.

```bash
pnpm dev:cloud   # http://localhost:4000
```

## A regra que mantém o Nest honesto

**O módulo liga, não pensa.** O Nest tem injeção de dependência própria, que
competiria com o nosso composition root. Por isso:

- `composition-root.ts` monta adapters e casos de uso — é o único lugar que
  escolhe implementação;
- `app.module.ts` só tem `useFactory` chamando o composition root;
- controllers validam com os schemas de `@telemetry/contracts`, chamam **um**
  caso de uso e devolvem DTO.

Nenhum `@Injectable` com regra de negócio dentro. `pnpm arch` pegou uma violação
dessa regra durante a escrita deste app — o módulo estava criando o adapter de
Postgres sozinho.

## Autenticação

Cookie selado com `iron-session`, emitido aqui e usado pelas duas aplicações. O
`SESSION_SECRET` é obrigatório: sem ele o processo não sobe, porque servir com
sessão forjável é pior que não servir.

## Estado

Esqueleto. Rotas de visibilidade e compartilhamento existem; persistência em
Postgres, migrations e o middleware de sessão estão em `docs/pendencias.md`.

| Variável | Para quê |
|---|---|
| `SESSION_SECRET` | segredo do cookie (mínimo 32 caracteres) |
| `DATABASE_URL` | conexão com o Postgres |
| `PORT` | porta HTTP (padrão 4000) |
