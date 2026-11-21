// The dev report: what happened on this device, so Thulani and Claude can see what to keep, fix or
// switch off. Kept on this device only, never synced. Private items show as "private item" unless
// she chooses to include them.
import { isPrivateTask } from './sync';
import { roomNameOf } from './time';
import type { Space, State, Task } from './types';

export type LoggedTask = { id: string; title: string; spaceId?: string };

export type DevEvent =
  | { at: string; kind: 'change'; label: string; tasks?: LoggedTask[] }
  /** A dictation next to what Focus made of it. */
  | { at: string; kind: 'dictation'; said: string; made: LoggedTask[]; ticked: LoggedTask[]; started: LoggedTask[]; question?: string }
  /** "Note for Claude": what she said, the screen she was on, and what was going on. */
  | { at: string; kind: 'note'; text: string; screen: string; context: string }
  | { at: string; kind: 'claude'; call: string; model: string; inputTokens: number; outputTokens: number };

export const MAX_EVENTS = 2000;

/** Anthropic list prices, US dollars per million tokens (input, output). From the Claude API reference, Nov 2026. */
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-fable-5-2': { input: 8, output: 40 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

/** Cost of one call in US dollars, or null for a model without a known price. */
export function costOf(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export function appendLog(log: DevEvent[] | undefined, ev: DevEvent): DevEvent[] {
  const next = [...(log ?? []), ev];
  return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
}

/** The same change twice in a row, a moment apart, is one tap that fired twice: log it once. */
export const REPEAT_WINDOW_MS = 1500;
export function appendChange(log: DevEvent[] | undefined, ev: Extract<DevEvent, { kind: 'change' }>): DevEvent[] {
  const last = log?.[log.length - 1];
  if (last && last.kind === 'change' && last.label === ev.label && Math.abs(new Date(ev.at).getTime() - new Date(last.at).getTime()) <= REPEAT_WINDOW_MS) {
    const ids = (e: typeof ev) => (e.tasks ?? []).map((t) => t.id).sort().join();
    if (ids(last) === ids(ev)) return log!;
  }
  return appendLog(log, ev);
}

export const logged = (t: Task): LoggedTask => ({ id: t.id, title: t.title, spaceId: t.spaceId });

/** The jobs a change touched: added, changed or removed. */
export function touched(before: Task[], after: Task[], max = 10): LoggedTask[] {
  const was = new Map(before.map((t) => [t.id, t]));
  const out: LoggedTask[] = [];
  const still = new Set<string>();
  for (const t of after) {
    still.add(t.id);
    if (was.get(t.id) !== t) out.push(logged(t));
  }
  for (const t of before) if (!still.has(t.id)) out.push(logged(t));
  return out.slice(0, max);
}

const weekAgo = (now: Date) => now.getTime() - 7 * 24 * 3600000;

/** The four numbers at the top of the dev report, for the last seven days. */
export function weekSummary(log: DevEvent[] | undefined, now: Date) {
  const recent = (log ?? []).filter((e) => new Date(e.at).getTime() >= weekAgo(now));
  const dictations = recent.filter((e) => e.kind === 'dictation');
  const tasksMade = dictations.reduce((n, e) => n + (e.kind === 'dictation' ? e.made.length : 0), 0);
  const skippedOrMoved = recent.filter((e) => e.kind === 'change' && /^(Snoozed|Moved|Not now|Not today|Planned for|Changed the plan)/.test(e.label)).length;
  const calls = recent.filter((e) => e.kind === 'claude');
  let costUsd = 0;
  let unpriced = 0;
  for (const c of calls) {
    if (c.kind !== 'claude') continue;
    const cost = costOf(c.model, c.inputTokens, c.outputTokens);
    if (cost === null) unpriced++;
    else costUsd += cost;
  }
  return { dictations: dictations.length, tasksMade, skippedOrMoved, calls: calls.length, costUsd, unpriced };
}

const PRIVATE = 'private item';

type Choice = NonNullable<State['settings']['momentumLog']>[number]['choice'];
/** Plain words for what she chose, not the ids the app stores. */
export const CHOICE: Record<Choice, string> = {
  five: 'Asked for 5 more minutes',
  tiny: 'Asked for one tiny thing',
  break: 'Took a break, then back',
  stop: 'Stopped for now',
  avoid: 'Avoiding this room',
  skip: 'Skipped this room',
};
const LOST: Choice[] = ['five', 'tiny', 'break'];
const AVOID_REASON: Record<string, string> = {
  'too-much': "there's too much",
  'no-homes': "doesn't know where things go",
  perfect: 'it has to look perfect',
  'dont-want': "something in there she doesn't want to deal with",
};

function show(t: LoggedTask, spaces: Space[], includePrivate: boolean) {
  return !includePrivate && isPrivateTask(t as Task, spaces) ? PRIVATE : t.title;
}

const stamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** The whole report as plain text (Markdown), ready to share into a Focus chat with Claude. */
export function buildReport(state: State, opts: { includePrivate: boolean; now: Date; device: string }): string {
  const { includePrivate, now } = opts;
  const log = state.devLog ?? [];
  const spaces = state.spaces;
  const s = weekSummary(log, now);
  const list = (ts: LoggedTask[]) => (ts.length ? ts.map((t) => show(t, spaces, includePrivate)).join('; ') : 'nothing');
  const lines: string[] = [
    `# Focus dev report`,
    ``,
    `Made ${stamp(now.toISOString())} on the ${opts.device}. ${includePrivate ? 'Private items included.' : 'Private items hidden.'}`,
    ``,
    `## This week`,
    `- Dictations: ${s.dictations}`,
    `- Tasks made: ${s.tasksMade}`,
    `- Skipped or moved: ${s.skippedOrMoved}`,
    `- Claude calls: ${s.calls}, about $${s.costUsd.toFixed(2)}${s.unpriced ? ` (plus ${s.unpriced} on a model with no known price)` : ''}`,
    ``,
    `## Notes for Claude`,
  ];
  const notes = log.filter((e) => e.kind === 'note');
  if (!notes.length) lines.push('None yet.');
  for (const n of notes) if (n.kind === 'note') lines.push(`- ${stamp(n.at)} on ${n.screen}: "${n.text}"`, `  - Context: ${n.context}`);

  lines.push('', '## You said, Focus made');
  const dict = log.filter((e) => e.kind === 'dictation');
  if (!dict.length) lines.push('No dictations yet.');
  for (const d of dict) {
    if (d.kind !== 'dictation') continue;
    const touchedPrivate = [...d.made, ...d.ticked, ...d.started].some((t) => isPrivateTask(t as Task, spaces));
    const said = !includePrivate && touchedPrivate ? PRIVATE : d.said;
    lines.push(`- ${stamp(d.at)}: "${said}"`, `  - Made: ${list(d.made)}`, `  - Ticked: ${list(d.ticked)}`, `  - Started: ${list(d.started)}`);
    if (d.question) lines.push(`  - Asked: ${d.question}`);
  }

  const rooms = state.settings.rooms;
  const momentum = state.settings.momentumLog ?? [];
  const entry = (m: (typeof momentum)[number]) => {
    const room = roomNameOf(rooms, m.room) ?? m.room;
    const reason = m.reason ? AVOID_REASON[m.reason] ?? m.reason : '';
    return `- ${stamp(m.at)}: ${CHOICE[m.choice] ?? m.choice}${reason ? ` (${reason})` : ''}${room ? `, ${room}` : ''}${m.job ? `, ${m.job}` : ''}`;
  };
  lines.push('', '## Lost momentum');
  const lost = momentum.filter((m) => LOST.includes(m.choice));
  if (!lost.length) lines.push('Nothing logged.');
  for (const m of lost) lines.push(entry(m));

  lines.push('', '## Stopped for now');
  const stopped = momentum.filter((m) => m.choice === 'stop');
  if (!stopped.length) lines.push('Nothing logged.');
  for (const m of stopped) lines.push(entry(m));

  lines.push('', '## Avoiding and skipping');
  const avoided = momentum.filter((m) => m.choice === 'avoid' || m.choice === 'skip');
  if (!avoided.length) lines.push('Nothing logged.');
  for (const m of avoided) lines.push(entry(m));

  lines.push('', '## Room rounds');
  const rounds = state.settings.roundLog ?? [];
  if (!rounds.length) lines.push('None yet.');
  for (const r of rounds) lines.push(`- ${r.day}: ${roomNameOf(rooms, r.room) ?? r.room}, ${r.min} min, ${r.done} done`);

  lines.push('', '## Activity');
  const changes = log.filter((e) => e.kind === 'change');
  if (!changes.length) lines.push('Nothing yet.');
  for (const c of changes) if (c.kind === 'change') lines.push(`- ${stamp(c.at)} ${c.label}${c.tasks?.length ? `: ${list(c.tasks)}` : ''}`);

  lines.push('', '## Claude calls');
  const calls = log.filter((e) => e.kind === 'claude');
  if (!calls.length) lines.push('None yet.');
  for (const c of calls) {
    if (c.kind !== 'claude') continue;
    const cost = costOf(c.model, c.inputTokens, c.outputTokens);
    lines.push(`- ${stamp(c.at)} ${c.call}, ${c.model}, ${c.inputTokens} in / ${c.outputTokens} out${cost === null ? '' : `, $${cost.toFixed(4)}`}`);
  }
  return lines.join('\n');
}
