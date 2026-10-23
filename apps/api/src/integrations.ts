import { Controller, Get, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

type SlotWindow = { startsAt: string | Date; duration: number };
type BusyPeriod = { start: string; end: string };
const asDate = (value: string | Date) => (value instanceof Date ? value : new Date(value));

@Injectable()
export class Integrations {
  private readonly logger = new Logger(Integrations.name);
  private accessToken?: { value: string; expiresAt: number };

  get aiEnabled() {
    return Boolean(process.env.GROQ_API_KEY);
  }

  get calendarEnabled() {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN &&
      process.env.GOOGLE_CALENDAR_ID,
    );
  }

  async confirmation(): Promise<string> {
    const fallback = "You're booked! Looking forward to our coffee chat.";
    if (!this.aiEnabled) return fallback;
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
          messages: [
            {
              role: 'system',
              content:
                'Write one short, friendly booking confirmation sentence. Do not invent a meeting link, email, date, or personal details.',
            },
            { role: 'user', content: 'A visitor successfully booked a coffee chat.' },
          ],
          max_completion_tokens: 100,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Groq returned HTTP ${response.status}`);
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const message = data.choices?.[0]?.message?.content?.trim();
      if (!message || message.length > 240) throw new Error('Groq returned no usable message');
      return message;
    } catch (error) {
      this.logger.warn(`AI confirmation unavailable; using fallback: ${(error as Error).message}`);
      return fallback;
    }
  }

  async annotateCalendar<T extends SlotWindow>(
    slots: T[],
  ): Promise<Array<T & { calendarConflict: boolean }>> {
    if (!this.calendarEnabled) return slots.map((slot) => ({ ...slot, calendarConflict: false }));
    if (!slots.length) return [];

    // Query by UTC month so one request covers each cluster of upcoming slots.
    const groups = new Map<string, T[]>();
    for (const slot of slots) {
      const date = asDate(slot.startsAt);
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
      groups.set(key, [...(groups.get(key) || []), slot]);
    }

    const conflicts = new Set<string>();
    for (const group of groups.values()) {
      const first = Math.min(...group.map((slot) => asDate(slot.startsAt).getTime()));
      const last = Math.max(
        ...group.map((slot) => asDate(slot.startsAt).getTime() + slot.duration * 60_000),
      );
      const busy = await this.getBusyPeriods(
        new Date(first).toISOString(),
        new Date(last).toISOString(),
      );
      for (const slot of group) {
        const start = asDate(slot.startsAt).getTime();
        const end = start + slot.duration * 60_000;
        if (
          busy.some((period) => start < Date.parse(period.end) && Date.parse(period.start) < end)
        ) {
          conflicts.add(asDate(slot.startsAt).toISOString());
        }
      }
    }
    return slots.map((slot) => ({
      ...slot,
      calendarConflict: conflicts.has(asDate(slot.startsAt).toISOString()),
    }));
  }

  async hasCalendarConflict(slot: SlotWindow): Promise<boolean> {
    if (!this.calendarEnabled) return false;
    const start = asDate(slot.startsAt).getTime();
    const end = start + slot.duration * 60_000;
    const busy = await this.getBusyPeriods(
      new Date(start).toISOString(),
      new Date(end).toISOString(),
    );
    return busy.some((period) => start < Date.parse(period.end) && Date.parse(period.start) < end);
  }

  private async getBusyPeriods(timeMin: string, timeMax: string): Promise<BusyPeriod[]> {
    try {
      const token = await this.getAccessToken();
      const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone: 'Europe/Skopje',
          items: [{ id: process.env.GOOGLE_CALENDAR_ID }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Google Calendar returned HTTP ${response.status}`);
      const data = (await response.json()) as {
        calendars?: Record<string, { busy?: BusyPeriod[]; errors?: unknown[] }>;
      };
      const calendar = data.calendars?.[process.env.GOOGLE_CALENDAR_ID!];
      if (!calendar || calendar.errors?.length)
        throw new Error('Google Calendar could not read the selected calendar');
      return calendar.busy || [];
    } catch (error) {
      this.logger.error(`Google Calendar availability check failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException(
        'Google Calendar is temporarily unavailable. Please try again shortly.',
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000)
      return this.accessToken.value;
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    });
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new Error(`Google OAuth token refresh returned HTTP ${response.status}`);
    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }
}

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: Integrations) {}

  @Get('status')
  status() {
    return {
      aiConfirmations: this.integrations.aiEnabled,
      googleCalendar: this.integrations.calendarEnabled,
    };
  }
}
