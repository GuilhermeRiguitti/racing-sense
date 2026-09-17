# @telemetry/adapter-ibt

Implementa `TelemetryDecoderPort` usando `@telemetry/ibt-core`.

É a camada anticorrupção do decoder: `VarHeader`, `VarType` e offsets ficam deste
lado da fronteira; a aplicação só vê `ChannelDescriptor`. Trocar o decoder — por
uma lib da comunidade ou por um formato de outro simulador — é reescrever este
pacote e nada mais.

## Estado

- Header, disk sub header e **catálogo de canais**: funcionando e testados contra
  um `.ibt` sintético montado no próprio teste.
- Session info (YAML em CP1252) e leitura de amostras: `NotImplementedError`.
  Ver `docs/pendencias.md`.
