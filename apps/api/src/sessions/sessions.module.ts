import { Module } from '@nestjs/common';
import { PilotsController, SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

@Module({
  controllers: [SessionsController, PilotsController],
  providers: [SessionsService],
})
export class SessionsModule {}
