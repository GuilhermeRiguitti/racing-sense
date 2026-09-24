import type { SetupNodeDto } from '../../shared/dto.js';

/**
 * `LeftFrontTire` → `Left Front Tire`; `LastTempsOMI` → `Last Temps OMI`.
 *
 * Só separa as palavras. Os nomes ficam em inglês porque são os da tela de
 * garagem do sim — é com esses nomes que o piloto procura o ajuste lá.
 */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/**
 * A ficha de acerto com que a sessão foi rodada, como o sim a declarou.
 *
 * Uma seção por bloco da garagem, fechada por padrão: a ficha de um GT3 tem
 * uma centena de linhas, e quem abre procura uma coisa específica.
 */
export function SetupSheet({ setup }: { setup: readonly SetupNodeDto[] | null }) {
  return (
    <section className="setup" aria-labelledby="setup-title">
      <h2 id="setup-title" className="section-title">
        Acerto do carro
      </h2>
      {setup === null ? (
        <p className="muted">
          Este arquivo não traz o acerto — série de acerto fixo o esconde, e sessões importadas antes
          desta versão do aplicativo não o guardaram.
        </p>
      ) : (
        <div className="setup__sections">
          {setup.map((secao) => (
            <details key={secao.key} className="setup__section">
              <summary>{humanizeKey(secao.key)}</summary>
              <Nos nos={secao.children} />
              {secao.value !== null && <p>{secao.value}</p>}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function Nos({ nos }: { nos: readonly SetupNodeDto[] }) {
  const folhas = nos.filter((no) => no.value !== null);
  const grupos = nos.filter((no) => no.value === null);
  return (
    <>
      {folhas.length > 0 && (
        <dl className="setup__entries">
          {folhas.map((folha) => (
            <div key={folha.key} className="setup__entry">
              <dt>{humanizeKey(folha.key)}</dt>
              <dd>{folha.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {grupos.map((grupo) => (
        <div key={grupo.key} className="setup__group">
          <h4 className="setup__group-title">{humanizeKey(grupo.key)}</h4>
          <Nos nos={grupo.children} />
        </div>
      ))}
    </>
  );
}
