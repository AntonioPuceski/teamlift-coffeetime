import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Database } from './database';

@Controller('health')
export class HealthController {
  constructor(private readonly db: Database) {}

  @Get()
  async check() {
    try {
      await this.db.pool.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
