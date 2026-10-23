import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import type { Request } from 'express';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  Length,
  MaxLength,
  Matches,
} from 'class-validator';
import { Database } from './database';
import { Integrations } from './integrations';

class AssistantRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 500)
  message!: string;
}

class CreateSlotDto {
  @IsISO8601({ strict: true })
  @Matches(/Z$|[+-]\d{2}:\d{2}$/, { message: 'startsAt must include a timezone' })
  startsAt!: string;

  @IsInt()
  @IsIn([15, 30, 45, 60])
  duration!: number;
}

class BookSlotDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  name!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

@Injectable()
export class SlotsService {
  constructor(
    private readonly db: Database,
    private readonly integrations: Integrations,
  ) {}

  async list() {
    const { rows } = await this.db.pool.query(`
      SELECT s.id, s.starts_at AS "startsAt", s.duration,
        EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id = s.id) AS booked
      FROM slots s WHERE starts_at > now() ORDER BY starts_at
    `);
    return this.integrations.annotateCalendar(rows);
  }

  async assist(message: string) {
    const { rows } = await this.db.pool.query(`
      SELECT s.id, s.starts_at AS "startsAt", s.duration,
        EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id = s.id) AS booked
      FROM slots s WHERE starts_at > now() ORDER BY starts_at LIMIT 120
    `);
    const available = (await this.integrations.annotateCalendar(rows)).filter(
      (slot) => !slot.booked && !slot.calendarConflict,
    );
    return this.integrations.recommendSlots(message, available);
  }

  async create(input: CreateSlotDto) {
    if (Date.parse(input.startsAt) <= Date.now())
      throw new BadRequestException('Choose a time in the future.');
    if (
      await this.integrations.hasCalendarConflict({
        startsAt: input.startsAt,
        duration: input.duration,
      })
    )
      throw new ConflictException(
        'This time conflicts with an event in the connected Google Calendar.',
      );
    try {
      const { rows } = await this.db.pool.query(
        `
        INSERT INTO slots (starts_at, duration, ends_at)
        VALUES ($1::timestamptz, $2::integer, $1::timestamptz + $2::integer * INTERVAL '1 minute')
        RETURNING id, starts_at AS "startsAt", duration, false AS booked
      `,
        [input.startsAt, input.duration],
      );
      return rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23P01')
        throw new ConflictException('This overlaps an existing slot. Choose another time.');
      throw error;
    }
  }

  async book(id: string, input: BookSlotDto) {
    const { rows: slots } = await this.db.pool.query(
      `SELECT s.starts_at AS "startsAt", s.duration,
        EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id = s.id) AS booked
      FROM slots s WHERE s.id = $1 AND s.starts_at > now()`,
      [id],
    );
    if (!slots.length) {
      const existing = await this.db.pool.query('SELECT id FROM slots WHERE id = $1', [id]);
      if (!existing.rowCount) throw new NotFoundException('This slot could not be found.');
      throw new ConflictException('This time has passed and is no longer available.');
    }
    if (slots[0].booked)
      throw new ConflictException('This time is no longer available. Please choose another slot.');
    if (await this.integrations.hasCalendarConflict(slots[0]))
      throw new ConflictException(
        'This time conflicts with an event in the connected Google Calendar.',
      );
    // One atomic insert. The unique constraint arbitrates concurrent requests.
    const { rows } = await this.db.pool.query(
      `
      INSERT INTO bookings (slot_id, name, email)
      SELECT id, $2, $3 FROM slots WHERE id = $1 AND starts_at > now()
      ON CONFLICT (slot_id) DO NOTHING RETURNING id
    `,
      [id, input.name, input.email],
    );
    if (!rows.length) {
      const existing = await this.db.pool.query('SELECT id FROM slots WHERE id = $1', [id]);
      if (!existing.rowCount) throw new NotFoundException('This slot could not be found.');
      throw new ConflictException('This time is no longer available. Please choose another slot.');
    }
    const [message, calendarEventCreated] = await Promise.all([
      this.integrations.confirmation(),
      this.integrations.createCalendarEvent(slots[0], input.name),
    ]);
    return {
      id: rows[0].id,
      message,
      calendarEventCreated,
    };
  }
}

@Controller('slots')
export class SlotsController {
  private readonly assistantRequests = new Map<string, { count: number; resetsAt: number }>();

  constructor(private readonly slots: SlotsService) {}
  @Get() list() {
    return this.slots.list();
  }
  @Post('assistant') assist(@Body() input: AssistantRequestDto, @Req() request: Request) {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const current = this.assistantRequests.get(key);
    if (!current || current.resetsAt <= now) {
      this.assistantRequests.set(key, { count: 1, resetsAt: now + 60_000 });
    } else if (current.count >= 8) {
      throw new HttpException(
        'Please wait a minute before asking the assistant again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    } else {
      current.count += 1;
    }
    for (const [ip, window] of this.assistantRequests) {
      if (window.resetsAt <= now) this.assistantRequests.delete(ip);
    }
    return this.slots.assist(input.message);
  }
  @Post() create(@Body() input: CreateSlotDto) {
    return this.slots.create(input);
  }
  @Post(':id/bookings') book(@Param('id', ParseUUIDPipe) id: string, @Body() input: BookSlotDto) {
    return this.slots.book(id, input);
  }
}
