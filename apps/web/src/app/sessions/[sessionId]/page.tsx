/**
 * Uma sessão compartilhada.
 *
 * Abre por link (`?share=...`) quando a sessão é não listada. O token vai para a
 * cloud-api, que aplica `canView` — sessão privada e token revogado respondem
 * "não encontrada", nunca "sem permissão": distinguir os dois já entrega que a
 * sessão existe.
 */
export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ share?: string }>;
}) {
  const [{ sessionId }, { share }] = await Promise.all([params, searchParams]);

  return (
    <main>
      <h1>Sessão</h1>
      <p>
        Esqueleto da sessão <code>{sessionId}</code>
        {share === undefined ? '' : ' (aberta por link de compartilhamento)'}: condições, voltas e
        comparação com a volta de outro piloto.
      </p>
    </main>
  );
}
