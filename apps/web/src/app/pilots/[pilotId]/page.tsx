/**
 * Perfil do piloto: as sessões dele que este visitante pode ver.
 *
 * Quem decide o que aparece é `canView`, no domínio, aplicado pela cloud-api.
 * A web nunca filtra visibilidade por conta própria — regra de acesso duplicada
 * é como vaza dado privado.
 */
export default async function PilotProfile({ params }: { params: Promise<{ pilotId: string }> }) {
  const { pilotId } = await params;

  return (
    <main>
      <h1>Perfil do piloto</h1>
      <p>
        Esqueleto do perfil <code>{pilotId}</code>: sessões, melhores voltas por pista e
        configuração de privacidade da conta.
      </p>
    </main>
  );
}
