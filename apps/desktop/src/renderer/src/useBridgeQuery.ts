import { useEffect, useRef, useState } from 'react';
import type { BridgeResult } from './bridge.js';

export interface QueryState<T> {
  readonly data: T | null;
  /** Verdadeiro enquanto busca — a tela anterior continua visível. */
  readonly loading: boolean;
  readonly error: string | null;
}

/**
 * Consulta pela ponte, refeita quando a chave muda.
 *
 * Duas proteções que a tela precisa:
 *
 * - **Resposta atrasada é descartada.** O piloto clica na volta 3 e logo na 4;
 *   se a 3 chegar depois, ela não pode sobrescrever a 4 na tela.
 * - **O dado anterior fica enquanto o novo chega.** Trocar de volta não apaga
 *   os gráficos e redesenha do zero: eles ficam esmaecidos até o novo chegar.
 *
 * `chave` nula significa "nada a consultar ainda" (nenhuma sessão escolhida).
 */
export function useBridgeQuery<T>(
  chave: string | null,
  buscar: () => Promise<BridgeResult<T>>,
): QueryState<T> {
  const [estado, setEstado] = useState<QueryState<T>>({ data: null, loading: false, error: null });
  const buscarAtual = useRef(buscar);
  buscarAtual.current = buscar;

  useEffect(() => {
    if (chave === null) {
      setEstado({ data: null, loading: false, error: null });
      return;
    }
    let valida = true;
    setEstado((anterior) => ({ ...anterior, loading: true }));

    void buscarAtual
      .current()
      .then((resultado) => {
        if (!valida) return;
        if (resultado.failed === true) {
          setEstado({ data: null, loading: false, error: resultado.message });
        } else {
          setEstado({ data: resultado.value, loading: false, error: null });
        }
      })
      .catch((erro: unknown) => {
        if (!valida) return;
        setEstado({ data: null, loading: false, error: String(erro) });
      });

    return () => {
      valida = false;
    };
  }, [chave]);

  return estado;
}
