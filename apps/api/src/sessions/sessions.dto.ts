import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VISIBILITIES, type Visibility } from '../auth/auth.dto.js';

const LAP_FLAGS = ['incomplete', 'pit', 'off-track'] as const;
const CHANNEL_TYPES = ['number', 'integer', 'boolean', 'text', 'bitfield'] as const;
const AXES = ['time', 'lapDistPct'] as const;
const finite = { allowNaN: false, allowInfinity: false };

// ---------------------------------------------------------------------------
// O que o desktop publica
// ---------------------------------------------------------------------------

export class ConditionsDto {
  @ApiProperty({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber(finite)
  airTempCelsius!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber(finite)
  trackTempCelsius!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber(finite)
  relativeHumidityPct!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber(finite)
  windSpeedMs!: number | null;

  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  skies!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Segundos desde a meia-noite.' })
  @IsOptional()
  @IsNumber(finite)
  timeOfDaySeconds!: number | null;

  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  trackUsage!: string | null;
}

export class SeriesDto {
  @ApiProperty()
  @IsString()
  channel!: string;

  @ApiProperty()
  @IsString()
  unit!: string;

  @ApiProperty({
    enum: CHANNEL_TYPES,
    enumName: 'ChannelType',
    description: 'Contínuo se liga com reta; discreto (marcha, booleano) se desenha em degrau.',
  })
  @IsIn(CHANNEL_TYPES)
  type!: (typeof CHANNEL_TYPES)[number];

  @ApiProperty({ enum: AXES, enumName: 'SeriesAxis' })
  @IsIn(AXES)
  axis!: (typeof AXES)[number];

  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsNumber(finite, { each: true })
  x!: number[];

  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsNumber(finite, { each: true })
  y!: number[];
}

export class LapDto {
  @ApiProperty()
  @IsInt()
  number!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  startSample!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  endSample!: number;

  @ApiProperty({ type: Number, nullable: true })
  @IsOptional()
  @IsPositive()
  lapTimeSeconds!: number | null;

  @ApiProperty()
  @IsBoolean()
  isComplete!: boolean;

  @ApiProperty({
    enum: LAP_FLAGS,
    enumName: 'LapFlag',
    isArray: true,
    description: 'Por que a volta não serve de referência. Vazio = serve.',
  })
  @IsIn(LAP_FLAGS, { each: true })
  flags!: (typeof LAP_FLAGS)[number][];
}

export class PublishedLapDto extends LapDto {
  @ApiProperty({ type: [SeriesDto], description: 'Séries por distância, como o desktop gravou.' })
  @ValidateNested({ each: true })
  @Type(() => SeriesDto)
  series!: SeriesDto[];
}

export class PublishSessionDto {
  @ApiProperty({ description: 'O id que a sessão tem no desktop. Publicar de novo substitui.' })
  @IsString()
  @MinLength(1)
  id!: string;

  @ApiProperty()
  @IsString()
  trackId!: string;

  @ApiProperty()
  @IsString()
  trackName!: string;

  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  trackConfig!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  @IsOptional()
  @IsPositive()
  trackLengthMeters!: number | null;

  @ApiProperty()
  @IsString()
  carId!: string;

  @ApiProperty()
  @IsString()
  carName!: string;

  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  driverName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  sessionType!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  recordedAt!: string | null;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  tickRate!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sampleCount!: number;

  @ApiProperty({ type: ConditionsDto })
  @ValidateNested()
  @Type(() => ConditionsDto)
  conditions!: ConditionsDto;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Melhor volta válida, calculada no desktop (ADR 0018).',
  })
  @IsOptional()
  @IsPositive()
  bestLapTimeSeconds!: number | null;

  @ApiProperty({ type: [PublishedLapDto] })
  @ValidateNested({ each: true })
  @Type(() => PublishedLapDto)
  laps!: PublishedLapDto[];
}

// ---------------------------------------------------------------------------
// O que a api devolve
// ---------------------------------------------------------------------------

export class PublishedSessionSummaryDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty()
  ownerName!: string;

  @ApiProperty()
  trackId!: string;

  @ApiProperty()
  trackName!: string;

  @ApiProperty()
  carId!: string;

  @ApiProperty()
  carName!: string;

  @ApiProperty({ enum: VISIBILITIES, enumName: 'Visibility' })
  visibility!: Visibility;

  @ApiProperty({ type: Number, nullable: true })
  bestLapTimeSeconds!: number | null;

  @ApiProperty()
  lapCount!: number;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  recordedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  publishedAt!: string;
}

export class PublishedSessionDto extends PublishedSessionSummaryDto {
  @ApiProperty({ type: String, nullable: true })
  trackConfig!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  trackLengthMeters!: number | null;

  @ApiProperty({ type: String, nullable: true })
  driverName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sessionType!: string | null;

  @ApiProperty()
  tickRate!: number;

  @ApiProperty({ type: ConditionsDto })
  conditions!: ConditionsDto;

  @ApiProperty({ type: [LapDto], description: 'Voltas sem as séries; peça a série por volta.' })
  laps!: LapDto[];
}

export class SetVisibilityDto {
  @ApiProperty({ enum: VISIBILITIES, enumName: 'Visibility' })
  @IsIn(VISIBILITIES)
  visibility!: Visibility;
}

export class ShareLinkDto {
  @ApiProperty()
  token!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt!: string | null;
}

export class ListPublicSessionsQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trackId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ShareTokenQuery {
  @ApiPropertyOptional({ description: 'Token de um link de compartilhamento.' })
  @IsOptional()
  @IsString()
  shareToken?: string;
}
