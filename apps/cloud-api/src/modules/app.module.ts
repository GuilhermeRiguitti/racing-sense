import { Module } from '@nestjs/common';
import { buildCloudUseCasesFromEnv, type CloudUseCases } from '../composition-root.js';
import { CLOUD_USE_CASES, SessionsController } from './sessions.controller.js';

/**
 * O módulo **liga**, não pensa.
 *
 * O Nest tem injeção de dependência própria, que competiria com o nosso
 * composition root se deixássemos. A regra: aqui só existe `useFactory`
 * chamando `buildCloudUseCases`. Nenhum `@Injectable` com regra de negócio
 * dentro — ver `docs/adr/0011-topologia-tres-aplicacoes.md`.
 */
@Module({
  controllers: [SessionsController],
  providers: [
    {
      provide: CLOUD_USE_CASES,
      useFactory: (): CloudUseCases => buildCloudUseCasesFromEnv(),
    },
  ],
})
export class AppModule {}
