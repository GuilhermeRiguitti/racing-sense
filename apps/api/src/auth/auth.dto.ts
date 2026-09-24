import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export const VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export class SignInDto {
  @ApiProperty({ example: 'piloto@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 200 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

export class RegisterDto extends SignInDto {
  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  displayName!: string;
}

export class PilotDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({
    enum: VISIBILITIES,
    enumName: 'Visibility',
    description: 'Visibilidade aplicada às sessões novas. Nasce `private`.',
  })
  defaultVisibility!: Visibility;
}
