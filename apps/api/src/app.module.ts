import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { PilotSessionMiddleware } from './auth/pilot-session.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SessionsModule } from './sessions/sessions.module.js';

@Module({
  imports: [PrismaModule, AuthModule, SessionsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(PilotSessionMiddleware).forRoutes('*path');
  }
}
