import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PilotDto, RegisterDto, SignInDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { CurrentPilot, PilotGuard, type RequestWithPilot } from './pilot-session.js';

/**
 * Login único da web e do desktop.
 *
 * O cookie selado é emitido aqui; quem chama só precisa reenviá-lo. Nenhum
 * token aparece no corpo das respostas.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOkResponse({ type: PilotDto, description: 'Conta criada e sessão aberta.' })
  async register(@Body() body: RegisterDto, @Req() request: RequestWithPilot): Promise<PilotDto> {
    const pilot = await this.auth.register(body);
    request.pilotSession.pilotId = pilot.id;
    await request.pilotSession.save();
    return pilot;
  }

  @Post('session')
  @HttpCode(200)
  @ApiOkResponse({ type: PilotDto, description: 'Sessão aberta; o cookie vem no `Set-Cookie`.' })
  @ApiUnauthorizedResponse({ description: 'E-mail ou senha inválidos.' })
  async signIn(@Body() body: SignInDto, @Req() request: RequestWithPilot): Promise<PilotDto> {
    const pilot = await this.auth.signIn(body);
    request.pilotSession.pilotId = pilot.id;
    await request.pilotSession.save();
    return pilot;
  }

  @Delete('session')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Sessão encerrada.' })
  signOut(@Req() request: RequestWithPilot): void {
    request.pilotSession.destroy();
  }

  @Get('me')
  @UseGuards(PilotGuard)
  @ApiCookieAuth()
  @ApiOkResponse({ type: PilotDto })
  @ApiUnauthorizedResponse({ description: 'Sem login. O app funciona igual, só sem a nuvem.' })
  async me(@CurrentPilot() pilotId: string, @Req() request: RequestWithPilot): Promise<PilotDto> {
    const pilot = await this.auth.findPilot(pilotId);
    if (pilot === null) {
      // Conta apagada com cookie ainda válido: a sessão deixa de valer.
      request.pilotSession.destroy();
      throw new UnauthorizedException();
    }
    return pilot;
  }
}
