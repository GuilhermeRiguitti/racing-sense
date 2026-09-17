import type { ChannelDescriptor, ChannelType } from '@telemetry/domain';
import { type VarHeader, VarType, type VarTypeCode } from '@telemetry/ibt-core';

const CHANNEL_TYPE_BY_VAR_TYPE: Readonly<Record<VarTypeCode, ChannelType>> = {
  [VarType.Char]: 'text',
  [VarType.Bool]: 'boolean',
  [VarType.Int]: 'number',
  [VarType.BitField]: 'bitfield',
  [VarType.Float]: 'number',
  [VarType.Double]: 'number',
};

/**
 * Traduz uma entrada da tabela de variáveis do `.ibt` para o vocabulário do domínio.
 *
 * É a camada anticorrupção do decoder: `VarHeader`, `VarType` e offsets ficam
 * deste lado da fronteira. O domínio só vê `ChannelDescriptor`.
 */
export function toChannelDescriptor(header: VarHeader): ChannelDescriptor {
  return {
    name: header.name,
    description: header.description,
    unit: header.unit,
    type: CHANNEL_TYPE_BY_VAR_TYPE[header.type],
    valuesPerSample: header.count,
  };
}
