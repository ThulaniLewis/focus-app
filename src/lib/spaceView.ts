// What a space page shows, worked out once for the phone and the tablet. Built to "Job search:
// ordered list and deadlines": real dates first, then the next list in order, which is never late.
import { DAY_COUNTDOWN, fmtDueDay } from './nudges';
import { dayKey, fmtTime, isDoneOn, parseLocal } from './time';
import type { Task } from './types';

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Weekdays", "Weekends", "Every day" or "Mon, Wed, Fri". */
export function daysLabel(days: number[]): string {
  const d = [...new Set(days)].sort().join();
  if (d === '0,1,2,3,4,5,6') return 'Every day';
  if (d === '1,2,3,4,5') return 'Weekdays';
  if (d === '0,6') return 'Weekends';
  return [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((n) => SHORT_DAYS[n]).join(', ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Deadline = { task: Task; label: string; reminders: string };
export type Dated = { task: Task; label: string };
export type Weekly = { task: Task; label: string };

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00`) - Date.parse(`${from}T12:00`)) / 86400000);

/** "Due 23 Nov, 2 days left" */
export function deadlineLabel(t: Task, now: Date): string {
  const today = dayKey(now);
  if (t.dueDay) {
    const n = daysBetween(today, t.dueDay);
    const left = n < 0 ? 'past' : n === 0 ? 'today' : n === 1 ? '1 day left' : `${n} days left`;
    return `Due ${fmtDueDay(t.dueDay)}, ${left}`;
  }
  const d = parseLocal(t.dueAt!)!;
  return `Due ${d.getDate()} ${MONTHS[d.getMonth()]} ${fmtTime(d)}`;
}

const REMINDERS = (() => {
  const words = DAY_COUNTDOWN.map(([n]) => (n === 0 ? 'the morning of' : n === 1 ? '1 day' : `${n} days`));
  return `Reminders at ${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
})();

export function spaceView(tasks: Task[], now: Date) {
  const today = dayKey(now);
  const open = tasks.filter((t) => !t.done);
  const isDeadline = (t: Task) => !!(t.dueDay || t.dueAt);

  const deadlines: Deadline[] = open
    .filter(isDeadline)
    .sort((a, b) => (a.dueDay ?? a.dueAt ?? '').localeCompare(b.dueDay ?? b.dueAt ?? ''))
    .map((task) => ({ task, label: deadlineLabel(task, now), reminders: task.dueDay ? REMINDERS : 'Reminders to start, an hour before and when it is due' }));

  // One-off things with a real time still to come: an interview, an appointment.
  const dated: Dated[] = open
    .filter((t) => t.at && !t.flex && !t.repeatDays?.length && !isDeadline(t) && (parseLocal(t.at)?.getTime() ?? 0) >= now.getTime() - 3600000)
    .sort((a, b) => a.at!.localeCompare(b.at!))
    .map((task) => {
      const d = parseLocal(task.at!)!;
      return { task, label: `${dayKey(d) === today ? 'Today' : `${d.getDate()} ${MONTHS[d.getMonth()]}`} ${fmtTime(d)}` };
    });

  // Whole-day diary entries (her child with someone for the day): shown with their day, never ticked.
  for (const task of open.filter((t) => t.kind === 'event' && t.allDay && t.day && t.day >= today).sort((a, b) => a.day!.localeCompare(b.day!))) {
    const [y, m, d] = task.day!.split('-').map(Number);
    dated.push({ task, label: `${task.day === today ? 'Today' : `${d} ${MONTHS[m - 1]}`}, all day` });
    void y;
  }

  // Repeating things at a real time, labelled by their days so two "Cook dinner"s read apart.
  const weekly: Weekly[] = open
    .filter((t) => t.at && !t.flex && t.repeatDays?.length)
    .sort((a, b) => a.at!.slice(11).localeCompare(b.at!.slice(11)))
    .map((task) => ({ task, label: `${daysLabel(task.repeatDays!)} ${task.at!.slice(11, 16)}` }));

  // Everything else, in order. No times: it's never late.
  const shown = new Set([...deadlines, ...dated, ...weekly].map((x) => x.task.id));
  const slot = (t: Task) => (t.at ? t.at.slice(11, 16) : '99:99');
  const next = tasks
    .filter((t) => !shown.has(t.id) && !t.someday && !(t.kind === 'event' && t.allDay) && (t.repeatDays?.length ? !isDoneOn(t, today) : !t.done))
    // The planned order: a flexible job's old slot only orders it, it's never shown.
    .sort((a, b) => slot(a).localeCompare(slot(b)) || a.createdAt.localeCompare(b.createdAt));
  const someday = open.filter((t) => t.someday && !shown.has(t.id));
  const doneLately = tasks.filter((t) => t.done && !t.repeatDays?.length).slice(-8).reverse();
  return { deadlines, dated, weekly, next, someday, doneLately };
}
