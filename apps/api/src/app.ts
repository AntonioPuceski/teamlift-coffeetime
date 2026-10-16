import { Module } from '@nestjs/common';
import { Database } from './database';
import { SlotsController, SlotsService } from './slots';
import { HealthController } from './health';

@Module({ controllers: [SlotsController, HealthController], providers: [Database, SlotsService] })
export class AppModule {}
