import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class Database implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Database.name);
  readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/coffeetime',
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  constructor() {
    // An idle connection can close when a hosted database restarts or sleeps.
    // pg removes the client; handling the event prevents an uncaught process exit.
    this.pool.on('error', () =>
      this.logger.warn('Idle database connection closed; the next request will reconnect.'),
    );
  }

  async onModuleInit() {
    // A range exclusion constraint also prevents overlapping host availability.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS slots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        starts_at TIMESTAMPTZ NOT NULL,
        duration INTEGER NOT NULL CHECK (duration IN (15, 30, 45, 60)),
        ends_at TIMESTAMPTZ NOT NULL,
        CHECK (ends_at = starts_at + duration * INTERVAL '1 minute'),
        EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)') WITH &&)
      );
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slot_id UUID NOT NULL UNIQUE REFERENCES slots(id),
        name VARCHAR(80) NOT NULL,
        email VARCHAR(254) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
