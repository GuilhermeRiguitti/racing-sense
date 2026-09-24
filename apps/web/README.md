# @telemetry/web

A rede social: perfil do piloto, feed de sessões públicas e voltas compartilhadas.

```bash
pnpm dev       # ou, da raiz: pnpm dev:web — http://localhost:3000
```

## Por que Next aqui (e não no desktop)

Este app é público, multiusuário e cheio de link que precisa abrir rápido e ser
indexável — que é exatamente onde renderização no servidor se paga. No
aplicativo do piloto seria peso morto: lá tudo é local, de um usuário só, e o
processo que observa a pasta de telemetria precisa de vida longa, coisa que o
servidor do Next não oferece.

## Fronteira

Fala **só** com a api, por HTTP, com o cliente tipado em `src/lib/api.ts`
(tipos gerados de `../api/openapi.json` — `pnpm api:types`). Não tem banco,
nunca fala com a máquina do piloto e nunca decide visibilidade por conta
própria: quem decide é a api (`canView`). Regra de acesso duplicada é como vaza
dado privado.

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_API_URL` | endereço da api (padrão `http://localhost:4000`) |
