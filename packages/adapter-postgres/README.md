# @telemetry/adapter-postgres

Armazenamento das sessões publicadas, no servidor. **Único dono de `pg`.**

## Estado

Esqueleto. `schema.sql.ts` traz a forma pretendida das tabelas — pilotos,
sessões publicadas com `visibility` em coluna, e links de compartilhamento
revogáveis.

Quando sair do esqueleto, roda a suíte de contrato de
`@telemetry/application/testing`, a mesma que o adapter em memória e o de SQLite
já passam. Enquanto não houver Postgres no CI, isso está em `docs/pendencias.md`.

## Por que a visibilidade é coluna

Consulta pública não pode depender de o `WHERE` estar certo em cada lugar. A
decisão de acesso é do domínio (`canView`), e o índice parcial de sessões
públicas é explícito no esquema.
