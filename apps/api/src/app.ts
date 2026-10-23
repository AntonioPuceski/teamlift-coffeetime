import { Module } from '@nestjs/common';
import { Database } from './database';
import { SlotsController, SlotsService } from './slots';
import { HealthController } from './health';
import { Integrations, IntegrationsController } from './integrations';

@Module({
  controllers: [SlotsController, HealthController, IntegrationsController],
  providers: [Database, SlotsService, Integrations],
})
export class AppModule {}
