import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Globe2,
  Plus,
  RefreshCw,
  Sparkles,
  Video,
  X,
} from 'lucide-react';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import './style.css';

type Slot = {
  id: string;
  startsAt: string;
  duration: number;
  booked: boolean;
  calendarConflict?: boolean;
};
const ZONE = 'Europe/Skopje';
const dateKey = (date: string | Date) => formatInTimeZone(date, ZONE, 'yyyy-MM-dd');
const time = (date: string) => formatInTimeZone(date, ZONE, 'HH:mm');
const dateLabel = (date: string, pattern = 'EEEE, MMMM d') => formatInTimeZone(date, ZONE, pattern);

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(' · ')
        : data.message || 'Something went wrong. Please try again.',
    );
  return data;
}

function App() {
  const [host, setHost] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [confirmation, setConfirmation] = useState<{
    slot: Slot;
    message: string;
    calendarEventCreated: boolean;
  } | null>(null);
  const [month, setMonth] = useState(() => dateKey(new Date()).slice(0, 7));
  const [duration, setDuration] = useState(0);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const initialized = useRef(false);

  async function load() {
    try {
      const data = await api<Slot[]>('/slots');
      const integrations = await api<{ googleCalendar: boolean; aiAssistant: boolean }>(
        '/integrations/status',
      );
      setSlots(data);
      setCalendarConnected(integrations.googleCalendar);
      setAiAssistantEnabled(integrations.aiAssistant);
      setError('');
      if (!initialized.current) {
        const first = data.find((slot) => !slot.booked);
        if (first) {
          setSelectedDay(dateKey(first.startsAt));
          setMonth(dateKey(first.startsAt).slice(0, 7));
        }
        initialized.current = true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load availability.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30_000);
    const refresh = () => void load();
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const available = slots.filter(
    (s) => !s.booked && !s.calendarConflict && (!duration || s.duration === duration),
  );
  const days = new Set(available.map((s) => dateKey(s.startsAt)));
  const daySlots = slots.filter(
    (s) => dateKey(s.startsAt) === selectedDay && (!duration || s.duration === duration),
  );
  const [year, monthNumber] = month.split('-').map(Number);
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const monthDays = new Date(year, monthNumber, 0).getDate();
  function shiftMonth(delta: number) {
    const next = new Date(year, monthNumber - 1 + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setHost(false);
          }}
        >
          <span className="brand-mark">
            <Coffee size={22} />
          </span>{' '}
          coffee<span className="brand-dot">time</span>
          <span className="brand-period">.</span>
        </a>
        <div className="top-right">
          <span className="small-note">A little time. A good conversation.</span>
          <button
            className={host ? 'nav-button active' : 'nav-button'}
            onClick={() => setHost(!host)}
          >
            {host ? <ArrowLeft size={15} /> : <CalendarDays size={15} />}{' '}
            {host ? 'Booking page' : 'Host view'}
          </button>
        </div>
      </header>

      <main>
        <div className="eyebrow">
          <span /> {host ? 'MAKE ROOM FOR CONNECTION' : 'GOOD CONVERSATIONS START HERE'}
        </div>
        <div className="page-heading">
          <h1>
            {host ? (
              <>
                Your time, <em>well shared.</em>
              </>
            ) : (
              <>
                Let’s make time <em>for a coffee.</em>
              </>
            )}
          </h1>
          <p>
            {host
              ? 'Open up a little space in your day. Someone has a great conversation to share.'
              : 'A fresh perspective, a new idea, or just a friendly hello. Pick a time and let’s talk.'}
          </p>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              <RefreshCw size={15} /> Try again
            </button>
          </div>
        )}

        {host ? (
          <HostView slots={slots} onCreated={load} />
        ) : (
          <div className="booking-card">
            <aside className="profile">
              <div className="profile-top">
                <div className="avatar">
                  AP
                  <span className="online-dot" />
                </div>
                <span className="availability-pill">
                  <span /> OPEN FOR A CHAT
                </span>
              </div>
              <p className="overline">YOUR HOST</p>
              <h2>Antonio Puceski</h2>
              <p className="profile-intro">Curious minds welcome.</p>
              <p className="profile-copy">
                Let’s swap ideas about tech, building things, and everything in between. Bring your
                curiosity. I’ll bring mine.
              </p>
              <div className="details">
                <span>
                  <Clock3 /> 15–60 minutes
                </span>
                <span>
                  <Video /> Online coffee chat
                </span>
                <span>
                  <Globe2 /> Skopje time
                </span>
                {calendarConnected && (
                  <span>
                    <CalendarDays /> Google Calendar checked
                  </span>
                )}
              </div>
              <div className="coffee-note">
                <Coffee size={24} />
                <p>
                  No agenda needed.
                  <br />
                  <strong>Just bring your favorite drink.</strong>
                </p>
              </div>
              <div className="profile-bottom">
                <span className="mini-star">✳</span> A small break. A new connection.
              </div>
            </aside>

            <section className="availability" aria-label="Choose a meeting time">
              <div className="section-heading">
                <div>
                  <span className="step-label">01 / FIND YOUR MOMENT</span>
                  <h2>Pick a day & time</h2>
                </div>
                {aiAssistantEnabled && (
                  <button className="assistant-trigger" onClick={() => setAssistantOpen(true)}>
                    <Sparkles size={16} /> Plan with AI
                  </button>
                )}
                <div className="timezone">
                  <Globe2 size={14} /> Europe/Skopje
                </div>
              </div>
              <div className="duration-row">
                <span>Time for a chat</span>
                <div className="duration-options">
                  {[0, 15, 30, 45, 60].map((d) => (
                    <button
                      key={d}
                      aria-pressed={duration === d}
                      className={duration === d ? 'selected' : ''}
                      onClick={() => setDuration(d)}
                    >
                      {d ? `${d} min` : 'Any'}
                    </button>
                  ))}
                </div>
              </div>
              {loading ? (
                <div className="empty-state" role="status">
                  <RefreshCw className="spin" />
                  <h3>Finding your next coffee break…</h3>
                </div>
              ) : (
                <div className="date-time-layout">
                  <div className="calendar">
                    <div className="calendar-heading">
                      <h3>
                        {new Date(year, monthNumber - 1, 1).toLocaleDateString('en-GB', {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </h3>
                      <div>
                        <button
                          className="icon-button"
                          aria-label="Previous month"
                          onClick={() => shiftMonth(-1)}
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Next month"
                          onClick={() => shiftMonth(1)}
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="calendar-grid">
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                        <span key={`weekday-${i}`} className="weekday">
                          {d}
                        </span>
                      ))}
                      {Array.from({ length: offset }, (_, i) => (
                        <span key={`blank-${i}`} />
                      ))}
                      {Array.from({ length: monthDays }, (_, i) => {
                        const key = `${month}-${String(i + 1).padStart(2, '0')}`;
                        return (
                          <button
                            key={key}
                            disabled={!days.has(key)}
                            aria-label={`${key}${days.has(key) ? ', times available' : ', no availability'}`}
                            aria-pressed={selectedDay === key}
                            className={`day ${selectedDay === key ? 'chosen' : ''} ${days.has(key) ? 'has-slots' : ''} ${key === dateKey(new Date()) ? 'today' : ''}`}
                            onClick={() => setSelectedDay(key)}
                          >
                            {i + 1}
                            {days.has(key) && <span />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="calendar-legend">
                      <span /> Available days <span className="today-line" /> Today
                    </div>
                  </div>
                  <div className="times">
                    <h3>
                      {selectedDay
                        ? dateLabel(
                            fromZonedTime(`${selectedDay}T12:00:00`, ZONE).toISOString(),
                            'EEE, MMM d',
                          )
                        : 'Your next coffee break'}
                    </h3>
                    <p className="times-count">
                      {selectedDay
                        ? `${daySlots.filter((s) => !s.booked && !s.calendarConflict).length} available times`
                        : 'Choose an available day'}
                    </p>
                    <div className="time-list">
                      {daySlots.length ? (
                        daySlots.map((slot) => (
                          <button
                            key={slot.id}
                            disabled={slot.booked || slot.calendarConflict}
                            className={`time-button ${slot.calendarConflict ? 'calendar-conflict' : ''}`}
                            onClick={() => setSelectedSlot(slot)}
                          >
                            <strong>{time(slot.startsAt)}</strong>
                            <span>
                              {slot.booked
                                ? 'Booked'
                                : slot.calendarConflict
                                  ? 'Calendar conflict'
                                  : `${slot.duration} min`}
                            </span>
                            {!slot.booked && !slot.calendarConflict && <ArrowRight size={16} />}
                          </button>
                        ))
                      ) : (
                        <div className="no-times">
                          <Coffee size={28} />
                          <p>
                            {available.length
                              ? 'Pick a highlighted day to see open times.'
                              : 'Nothing brewing just yet. Check back soon for new times.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="booking-footnote">
                <Check size={15} /> A little time, reserved just for you.{' '}
                <span>No account needed.</span>
              </div>
            </section>
          </div>
        )}

        <div className="below-card">
          <span>
            <span className="tiny-spark">✳</span> Less back-and-forth. More good conversations.
          </span>
          <span>Made for a human connection.</span>
        </div>
      </main>
      <footer>
        <span>
          coffeetime<span className="brand-period">.</span>
        </span>
        <span>
          A small project by Antonio Puceski <span className="footer-divider">/</span> TeamLift
          Challenge
        </span>
        <span>
          Take a break. Say hello. <Coffee size={14} />
        </span>
      </footer>
      {assistantOpen && (
        <AssistantDialog
          slots={available}
          onClose={() => setAssistantOpen(false)}
          onChoose={(slot) => {
            setAssistantOpen(false);
            setSelectedSlot(slot);
          }}
        />
      )}
      {selectedSlot && (
        <BookingDialog
          slot={selectedSlot}
          calendarConnected={calendarConnected}
          onClose={() => setSelectedSlot(null)}
          onBooked={(message) => {
            setConfirmation({
              slot: selectedSlot,
              message: message.message,
              calendarEventCreated: message.calendarEventCreated,
            });
            setSelectedSlot(null);
            void load();
          }}
          onConflict={load}
        />
      )}
      {confirmation && (
        <Dialog onClose={() => setConfirmation(null)} title="You’re booked.">
          <div className="success-icon">
            <Check size={30} />
          </div>
          <p className="overline">ONE GOOD CONVERSATION, COMING UP</p>
          <h2 id="dialog-title">You’re booked.</h2>
          <p>{confirmation.message}</p>
          <div className="booking-summary">
            <CalendarDays size={20} />
            <div>
              <strong>{dateLabel(confirmation.slot.startsAt)}</strong>
              <span>
                {time(confirmation.slot.startsAt)} · {confirmation.slot.duration} minutes · Skopje
                time
              </span>
            </div>
          </div>
          <p className="subtle">
            Your booking is saved.
            {confirmation.calendarEventCreated
              ? ' An event was added to Antonio’s Google Calendar.'
              : calendarConnected
                ? ' The booking is saved, but Google Calendar did not confirm the event sync.'
                : ' Connect Google Calendar to add confirmed bookings to the host calendar.'}{' '}
            No email or meeting link is sent.
          </p>
          <button className="primary-button full-width" onClick={() => setConfirmation(null)}>
            Back to availability <ArrowRight size={16} />
          </button>
        </Dialog>
      )}
    </div>
  );
}

function HostView({ slots, onCreated }: { slots: Slot[]; onCreated: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dateInput = useRef<HTMLInputElement>(null);
  const counts = useMemo(
    () => ({
      open: slots.filter((s) => !s.booked && !s.calendarConflict).length,
      booked: slots.filter((s) => s.booked).length,
    }),
    [slots],
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    try {
      const local = `${data.get('date')}T${data.get('time')}:00`;
      const instant = fromZonedTime(local, ZONE);
      if (formatInTimeZone(instant, ZONE, "yyyy-MM-dd'T'HH:mm:ss") !== local)
        throw new Error(
          'This time does not exist because of the daylight-saving change. Choose another time.',
        );
      await api('/slots', {
        startsAt: instant.toISOString(),
        duration: Number(data.get('duration')),
      });
      setMessage('Your new time is live on the booking page.');
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create slot.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="host-layout">
      <section className="host-form panel">
        <span className="step-label">OPEN UP YOUR CALENDAR</span>
        <h2>Add an available time</h2>
        <p className="subtle">All times are in Europe/Skopje.</p>
        <form onSubmit={submit}>
          <label>
            Date
            <input ref={dateInput} name="date" type="date" min={dateKey(new Date())} required />
          </label>
          <div className="form-row">
            <label>
              Start time
              <input name="time" type="time" required defaultValue="10:00" />
            </label>
            <label>
              Duration
              <select name="duration" defaultValue="30">
                {[15, 30, 45, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="form-success" role="status">
              {message}
            </p>
          )}
          <button className="primary-button full-width" disabled={busy}>
            {busy ? 'Publishing…' : 'Publish availability'}
            <Plus size={17} />
          </button>
        </form>
        <p className="host-note">
          Shared demo host view · No accounts, as requested in the challenge.
        </p>
      </section>
      <section className="panel host-slots">
        <div className="section-heading">
          <div>
            <span className="step-label">YOUR UPCOMING SCHEDULE</span>
            <h2>A little room to connect</h2>
          </div>
        </div>
        <div className="stats">
          <div>
            <strong>{counts.open}</strong>
            <span>Available slots</span>
          </div>
          <div>
            <strong>{counts.booked}</strong>
            <span>Booked conversations</span>
          </div>
        </div>
        {slots.length ? (
          <div className="host-slot-list">
            {slots.map((slot) => (
              <div className="host-slot" key={slot.id}>
                <div className="date-tile">
                  <span>{dateLabel(slot.startsAt, 'MMM')}</span>
                  <strong>{dateLabel(slot.startsAt, 'd')}</strong>
                </div>
                <div>
                  <strong>{dateLabel(slot.startsAt, 'EEEE')}</strong>
                  <p>
                    {time(slot.startsAt)} · {slot.duration} minutes
                  </p>
                </div>
                <span
                  className={`status-pill ${slot.booked ? 'booked' : ''} ${slot.calendarConflict ? 'calendar-conflict' : ''}`}
                >
                  {slot.booked
                    ? 'Booked'
                    : slot.calendarConflict
                      ? 'Calendar conflict'
                      : 'Available'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <CalendarDays size={32} />
            <h3>Your calendar starts here.</h3>
            <p>Publish your first time to welcome a new conversation.</p>
            <button className="text-button" onClick={() => dateInput.current?.focus()}>
              Add your first slot <ArrowRight size={15} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function AssistantDialog({
  slots,
  onClose,
  onChoose,
}: {
  slots: Slot[];
  onClose: () => void;
  onChoose: (slot: Slot) => void;
}) {
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState('');
  const [suggested, setSuggested] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuggested([]);
    try {
      const result = await api<{ message: string; slotIds: string[] }>('/slots/assistant', {
        message: query,
      });
      setReply(result.message);
      setSuggested(
        result.slotIds
          .map((id) => slots.find((slot) => slot.id === id))
          .filter((slot): slot is Slot => Boolean(slot)),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'I couldn’t check the open times. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onClose} title="Plan your coffee chat">
      <p className="overline">A LITTLE HELP FROM AI</p>
      <h2 id="dialog-title">Find a time that fits.</h2>
      <p className="subtle assistant-intro">
        Tell me what works for you, like “a 30-minute chat next week in the afternoon.” I’ll suggest
        open times; you’ll review the details before booking.
      </p>
      <form className="assistant-form" onSubmit={submit}>
        <label htmlFor="assistant-query">When would you like to meet?</label>
        <textarea
          id="assistant-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="For example: 30 minutes, next week, preferably after lunch"
          required
          autoFocus
        />
        <button className="primary-button full-width" disabled={busy || !query.trim()}>
          {busy ? 'Looking at available times…' : 'Find a time'} <Sparkles size={16} />
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {reply && (
        <div className="assistant-reply" aria-live="polite">
          <p>{reply}</p>
          {suggested.map((slot) => (
            <button className="assistant-slot" key={slot.id} onClick={() => onChoose(slot)}>
              <span>
                <strong>{dateLabel(slot.startsAt, 'EEE, MMM d')}</strong>
                <small>
                  {time(slot.startsAt)} · {slot.duration} min · Skopje time
                </small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
      )}
      <p className="subtle privacy-note">
        Your scheduling preference is sent to Groq to find a match. Don’t include contact details;
        the assistant never completes a booking without your confirmation.
      </p>
    </Dialog>
  );
}

function Dialog({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <button
        type="button"
        className="icon-button close-button"
        aria-label="Close dialog"
        onClick={onClose}
      >
        <X size={20} />
      </button>
      {children}
    </dialog>
  );
}

function BookingDialog({
  slot,
  calendarConnected,
  onClose,
  onBooked,
  onConflict,
}: {
  slot: Slot;
  calendarConnected: boolean;
  onClose: () => void;
  onBooked: (result: { message: string; calendarEventCreated: boolean }) => void;
  onConflict: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ message: string; calendarEventCreated: boolean }>(
        `/slots/${slot.id}/bookings`,
        {
          name: data.get('name'),
          email: data.get('email'),
        },
      );
      onBooked(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to book. Please try again.');
      await onConflict();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Make it a coffee date"
    >
      <p className="overline">02 / MAKE IT HAPPEN</p>
      <h2>Make it a coffee date.</h2>
      <p className="subtle">Just a couple of details, and this time is yours.</p>
      <div className="booking-summary">
        <CalendarDays size={21} />
        <div>
          <strong>{dateLabel(slot.startsAt)}</strong>
          <span>
            {time(slot.startsAt)} · {slot.duration} minutes · Skopje time
          </span>
        </div>
      </div>
      <form onSubmit={submit}>
        <label>
          Your name
          <input
            name="name"
            autoComplete="name"
            placeholder="Alex Morgan"
            maxLength={80}
            required
            autoFocus
          />
        </label>
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="alex@example.com"
            maxLength={254}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button full-width" disabled={busy}>
          {busy ? 'Reserving your time…' : 'Confirm coffee chat'}
          <ArrowRight size={17} />
        </button>
      </form>
      <p className="subtle privacy-note">
        {calendarConnected
          ? 'Your name and booked time are added to the host calendar. Your email stays private; no invite is sent.'
          : 'Your details are stored with this booking and aren’t shown publicly.'}
      </p>
    </Dialog>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
