// Single-file scheduler module for Roaster
// File: src/scheduler/scheduler.ts
// Purpose: provide a portable scheduler implementing the greedy equity algorithm described.

export type GroupSlot = 'A' | 'B' | 'C' | 'D';

export type Person = {
  id: string;
  name: string;
  group: GroupSlot;
  credit?: number; // positive means they've covered extra shifts and should get fewer assignments
  assignedCount?: number; // used during generation
  leaves?: Array<{ start: string; end: string }>; // ISO dates inclusive
};

export type Shift = {
  date: string; // ISO yyyy-mm-dd
  slot: GroupSlot;
  assignedPersonId: string | null;
  coveredBy?: string | null; // if assignedPersonId is covering someone
  isCover?: boolean;
};

export type Settings = {
  rotationOrder: GroupSlot[]; // e.g., ['A','B','C','D']
  rotationStart?: string; // ISO date
  equityWindowDays?: number; // rolling window - not fully implemented but placeholder
  maxConsecutive?: number; // max consecutive days a person can be assigned
  allowCrossGroupCoverage?: boolean; // allow people from other groups to cover
};

// Utility: format ISO date (yyyy-mm-dd)
function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISO(dateISO: string): Date {
  return new Date(dateISO + 'T00:00:00');
}

function addDays(dateISO: string, days: number): string {
  const d = parseISO(dateISO);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function datesBetween(startISO: string, endISO: string): string[] {
  const res: string[] = [];
  let cur = parseISO(startISO);
  const end = parseISO(endISO);
  while (cur <= end) {
    res.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return res;
}

function overlapsRange(dateISO: string, startISO: string, endISO: string) {
  return dateISO >= startISO && dateISO <= endISO;
}

// Check availability: return false if person has a leave covering the date
function isAvailable(person: Person, dateISO: string): boolean {
  if (!person.leaves) return true;
  for (const r of person.leaves) {
    if (overlapsRange(dateISO, r.start, r.end)) return false;
  }
  return true;
}

// Count consecutive assignments ending on dateISO in schedule
function countConsecutive(scheduleMap: Map<string, Shift[]>, personId: string, dateISO: string): number {
  // go backwards from dateISO until a day where person was not assigned
  let count = 0;
  let d = dateISO;
  while (true) {
    const shifts = scheduleMap.get(d) || [];
    const assignedToday = shifts.some(s => s.assignedPersonId === personId);
    if (!assignedToday) break;
    count++;
    d = addDays(d, -1);
  }
  return count;
}

// Public API object
export class Scheduler {
  people: Person[];
  settings: Settings;

  constructor(people: Person[] = [], settings?: Partial<Settings>) {
    this.people = people.map(p => ({ ...p, credit: p.credit ?? 0, assignedCount: 0, leaves: p.leaves ?? [] }));
    this.settings = {
      rotationOrder: ['A', 'B', 'C', 'D'],
      rotationStart: undefined,
      equityWindowDays: 30,
      maxConsecutive: 7,
      allowCrossGroupCoverage: true,
      ...(settings || {}),
    };
  }

  addPerson(p: Person) {
    const existing = this.people.find(x => x.id === p.id);
    if (existing) Object.assign(existing, p);
    else this.people.push({ ...p, credit: p.credit ?? 0, assignedCount: 0, leaves: p.leaves ?? [] });
  }

  setLeave(personId: string, startISO: string, durationDays: number) {
    const p = this.people.find(x => x.id === personId);
    if (!p) throw new Error('person not found');
    const end = addDays(startISO, Math.max(0, durationDays - 1));
    p.leaves = p.leaves || [];
    p.leaves.push({ start: startISO, end });
  }

  clearLeaves(personId: string) {
    const p = this.people.find(x => x.id === personId);
    if (p) p.leaves = [];
  }

  // adjust an assignment: force a person into a shift (useful for manual overrides)
  adjustAssignment(schedule: Shift[], dateISO: string, slot: GroupSlot, personId: string | null) {
    const idx = schedule.findIndex(s => s.date === dateISO && s.slot === slot);
    if (idx >= 0) schedule[idx].assignedPersonId = personId;
    else schedule.push({ date: dateISO, slot, assignedPersonId: personId });
  }

  // Primary function: generate schedule between startISO and endISO inclusive
  generateSchedule(startISO: string, endISO: string, opts?: Partial<Settings>): Shift[] {
    this.settings = { ...this.settings, ...(opts || {}) };

    // reset counters
    for (const p of this.people) {
      p.assignedCount = 0;
      if (p.credit === undefined) p.credit = 0;
    }

    const days = datesBetween(startISO, endISO);
    const schedule: Shift[] = [];
    const scheduleMap = new Map<string, Shift[]>();

    for (const dateISO of days) {
      // initialize day shifts
      const dayShifts: Shift[] = this.settings.rotationOrder.map(slot => ({ date: dateISO, slot, assignedPersonId: null }));

      // For each slot, choose candidate
      for (const slot of this.settings.rotationOrder) {
        // Build candidates: those in slot group or cross-group allowed
        let candidates = this.people.filter(p => (p.group === slot) || this.settings.allowCrossGroupCoverage);
        // Filter by availability
        candidates = candidates.filter(p => isAvailable(p, dateISO));
        // Filter by maxConsecutive
        candidates = candidates.filter(p => {
          if (!this.settings.maxConsecutive) return true;
          const cons = countConsecutive(scheduleMap, p.id, dateISO);
          return cons < (this.settings.maxConsecutive || Infinity);
        });

        if (candidates.length === 0) {
          // no one available: leave unassigned (null) -- could be handled by manual override
          continue;
        }

        // Compute expected_assigned: simple proportional expected: total assigned so far / people count
        // For greedy, we'll use (assignedCount - credit) as score
        candidates.sort((a, b) => {
          const aScore = (a.assignedCount ?? 0) - (a.credit ?? 0);
          const bScore = (b.assignedCount ?? 0) - (b.credit ?? 0);
          if (aScore !== bScore) return aScore - bScore; // prefer smaller
          // tiebreaker: prefer same-group first, then lower name
          if (a.group === slot && b.group !== slot) return -1;
          if (b.group === slot && a.group !== slot) return 1;
          return a.name.localeCompare(b.name);
        });

        const winner = candidates[0];
        // assign
        const shift: Shift = { date: dateISO, slot, assignedPersonId: winner.id };
        // If winner is covering a slot from someone who is on leave (i.e., group owner is not available), mark cover
        // Find regular owner of this slot if any person normally assigned today would be from that group
        const ownerCandidates = this.people.filter(p => p.group === slot);
        const ownerUnavailable = ownerCandidates.every(op => !isAvailable(op, dateISO));
        if (ownerUnavailable && winner.group !== slot) {
          shift.isCover = true;
          shift.coveredBy = winner.id;
          // give credit for covering
          winner.credit = (winner.credit ?? 0) + 1;
        }

        dayShifts.forEach((ds, i) => { if (ds.slot === slot) dayShifts[i] = shift; });
        winner.assignedCount = (winner.assignedCount ?? 0) + 1;
      }

      scheduleMap.set(dateISO, dayShifts);
      schedule.push(...dayShifts);
    }

    // return schedule array
    return schedule;
  }

  // Compute weights/credits snapshot
  getWeights(): Array<{ personId: string; name: string; credit: number; assignedCount: number }> {
    return this.people.map(p => ({ personId: p.id, name: p.name, credit: p.credit ?? 0, assignedCount: p.assignedCount ?? 0 }));
  }

  // Utility: simple CSV export of schedule
  scheduleToCSV(schedule: Shift[]): string {
    const lines = ['date,slot,assignedPersonId,isCover,coveredBy'];
    for (const s of schedule) {
      lines.push([s.date, s.slot, s.assignedPersonId ?? '', (s.isCover ? '1' : '0'), s.coveredBy ?? ''].join(','));
    }
    return lines.join('\n');
  }
}

// Example usage (commented):
/*
const people = [
  { id: 'p1', name: 'Alice', group: 'A' },
  { id: 'p2', name: 'Bob', group: 'B' },
  { id: 'p3', name: 'Cara', group: 'C' },
  { id: 'p4', name: 'Dan', group: 'D' },
];
const s = new Scheduler(people);
s.setLeave('p2', '2026-09-10', 3);
const schedule = s.generateSchedule('2026-09-10', '2026-09-20');
console.log(s.scheduleToCSV(schedule));
console.table(s.getWeights());
*/
