import type { SessionDto } from '@telemetry/contracts';
import { useCallback, useEffect, useState } from 'react';
import { bridge } from './bridge.js';

/**
 * As sessões do piloto, atualizadas sozinhas.
 *
 * O padrão do aplicativo inteiro: o evento **não traz dado**, ele só avisa que
 * mudou. Quem responde é uma consulta. Assim não existem duas versões da
 * verdade, e um evento perdido custa no máximo uma tela velha até a próxima
 * consulta.
 */
export function useSessions(): {
  sessions: readonly SessionDto[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [sessions, setSessions] = useState<readonly SessionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void (async () => {
      const result = await bridge().listSessions();
      if (result.failed === true) {
        setError(result.message);
      } else {
        setError(null);
        setSessions(result.value);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    refresh();

    const unsubscribe = bridge().onEvent((event) => {
      // Só o que muda esta lista. Reagir a tudo faria a tela recarregar por
      // causa de uma publicação que o piloto nem está olhando.
      if (event.type === 'session-ingested') {
        refresh();
      }
    });

    return unsubscribe;
  }, [refresh]);

  return { sessions, loading, error, refresh };
}
