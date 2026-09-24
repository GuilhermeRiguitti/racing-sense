import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PilotDto, RegisterDto, SignInDto } from './auth.dto.js';
import { hashPassword, verifyPassword } from './password.js';

const toPilotDto = (pilot: {
  id: string;
  displayName: string;
  defaultVisibility: PilotDto['defaultVisibility'];
}): PilotDto => ({
  id: pilot.id,
  displayName: pilot.displayName,
  defaultVisibility: pilot.defaultVisibility,
});

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register({ email, password, displayName }: RegisterDto): Promise<PilotDto> {
    const existing = await this.prisma.pilot.findUnique({ where: { email } });
    if (existing !== null) {
      throw new ConflictException('E-mail já cadastrado');
    }
    const pilot = await this.prisma.pilot.create({
      data: { email, displayName, passwordHash: await hashPassword(password) },
    });
    return toPilotDto(pilot);
  }

  async signIn({ email, password }: SignInDto): Promise<PilotDto> {
    const pilot = await this.prisma.pilot.findUnique({ where: { email } });
    // A mesma resposta para e-mail inexistente e senha errada: distinguir os dois
    // entregaria quais e-mails têm conta.
    if (pilot === null || !(await verifyPassword(password, pilot.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    return toPilotDto(pilot);
  }

  async findPilot(id: string): Promise<PilotDto | null> {
    const pilot = await this.prisma.pilot.findUnique({ where: { id } });
    return pilot === null ? null : toPilotDto(pilot);
  }
}
