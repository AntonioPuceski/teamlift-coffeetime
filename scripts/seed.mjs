import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
const api = process.env.API_URL || 'http://127.0.0.1:3001/api';
const existing = await fetch(`${api}/slots`).then((r) => {
  if (!r.ok) throw new Error('API is unavailable');
  return r.json();
});
if (existing.length) {
  console.log('Upcoming slots already exist; leaving your schedule unchanged.');
  process.exit(0);
}
let addedDays = 0;
for (let day = 1; addedDays < 4; day++) {
  const date = new Date(Date.now() + day * 86400000);
  if (['Sat', 'Sun'].includes(formatInTimeZone(date, 'Europe/Skopje', 'EEE'))) continue;
  const key = formatInTimeZone(date, 'Europe/Skopje', 'yyyy-MM-dd');
  for (const [hour, duration] of [
    ['10:00', 30],
    ['11:00', 15],
    ['14:00', 45],
    ['15:00', 60],
  ]) {
    const response = await fetch(`${api}/slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startsAt: fromZonedTime(`${key}T${hour}:00`, 'Europe/Skopje').toISOString(),
        duration,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
  }
  addedDays++;
}
console.log('Added 16 real, bookable demo slots over the next four weekdays.');
