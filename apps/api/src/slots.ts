import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
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
  constructor(private readonly db: Database) {}

  async list() {
    const { rows } = await this.db.pool.query(`
      SELECT s.id, s.starts_at AS "startsAt", s.duration,
        EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id = s.id) AS booked
      FROM slots s WHERE starts_at > now() ORDER BY starts_at
    `);
    return rows;
  }

  async create(input: CreateSlotDto) {
    if (Date.parse(input.startsAt) <= Date.now())
      throw new BadRequestException('Choose a time in the future.');
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
    return {
      id: rows[0].id,
      message: `You're booked, ${input.name}! Looking forward to our coffee chat.`,
    };
  }
}

@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}
  @Get() list() {
    return this.slots.list();
  }
  @Post() create(@Body() input: CreateSlotDto) {
    return this.slots.create(input);
  }
  @Post(':id/bookings') book(@Param('id', ParseUUIDPipe) id: string, @Body() input: BookSlotDto) {
    return this.slots.book(id, input);
  }
}
