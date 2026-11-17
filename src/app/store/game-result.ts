export interface GameResult {
  /** Calendar day of the game in local time, YYYY-MM-DD. */
  date: string;
  correct: number;
  incorrect: number;
  /** Optional game id (variants, answer, timer, meteors). */
  game?: string;
}

export type StatsPeriod = 'today' | '7days' | '30days';

export interface StatsRow {
  date: string;
  games: number;
  correct: number;
  incorrect: number;
  /** Round percent of correct answers among all answers; 0 if no answers. */
  correctPercent: number;
}

const STORAGE_KEY = 'local_math_game_results';

export function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isGameResult(value: unknown): value is GameResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const gameOk =
    candidate['game'] === undefined || typeof candidate['game'] === 'string';
  return (
    typeof candidate['date'] === 'string' &&
    typeof candidate['correct'] === 'number' &&
    typeof candidate['incorrect'] === 'number' &&
    gameOk
  );
}

/** Sum of correct answers for a calendar day, optionally excluding a game. */
export function todayCorrectCount(
  results: readonly GameResult[],
  options?: { excludeGame?: string; now?: Date },
): number {
  const today = filterResultsByPeriod(results, 'today', options?.now);
  return today.reduce((sum, result) => {
    if (options?.excludeGame && result.game === options.excludeGame) {
      return sum;
    }
    return sum + result.correct;
  }, 0);
}

export function loadGameResults(): GameResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isGameResult);
  } catch {
    return [];
  }
}

export function persistGameResults(results: readonly GameResult[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
}

export function filterResultsByPeriod(
  results: readonly GameResult[],
  period: StatsPeriod,
  now: Date = new Date(),
): GameResult[] {
  const todayKey = toDateKey(now);

  if (period === 'today') {
    return results.filter((result) => result.date === todayKey);
  }

  const days = period === '7days' ? 7 : 30;
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  from.setDate(from.getDate() - (days - 1));
  const fromKey = toDateKey(from);

  return results.filter(
    (result) => result.date >= fromKey && result.date <= todayKey,
  );
}

export function correctPercent(correct: number, incorrect: number): number {
  const total = correct + incorrect;
  if (total <= 0) {
    return 0;
  }
  return Math.round((correct / total) * 100);
}

export function buildDailyRows(results: readonly GameResult[]): StatsRow[] {
  const byDate = new Map<string, StatsRow>();

  for (const result of results) {
    const existing = byDate.get(result.date);
    if (existing) {
      existing.games += 1;
      existing.correct += result.correct;
      existing.incorrect += result.incorrect;
    } else {
      byDate.set(result.date, {
        date: result.date,
        games: 1,
        correct: result.correct,
        incorrect: result.incorrect,
        correctPercent: 0,
      });
    }
  }

  return [...byDate.values()]
    .map((row) => ({
      ...row,
      correctPercent: correctPercent(row.correct, row.incorrect),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function aggregateStatsRows(rows: readonly StatsRow[]): StatsRow {
  const totals = rows.reduce(
    (acc, row) => ({
      games: acc.games + row.games,
      correct: acc.correct + row.correct,
      incorrect: acc.incorrect + row.incorrect,
    }),
    { games: 0, correct: 0, incorrect: 0 },
  );

  return {
    date: 'Итого',
    games: totals.games,
    correct: totals.correct,
    incorrect: totals.incorrect,
    correctPercent: correctPercent(totals.correct, totals.incorrect),
  };
}

export function formatStatsDate(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    return dateKey;
  }
  return `${match[3]}.${match[2]}.${match[1]!.slice(2)}`;
}
