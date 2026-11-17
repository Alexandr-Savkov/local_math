import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  aggregateStatsRows,
  buildDailyRows,
  filterResultsByPeriod,
  type GameResult,
  loadGameResults,
  persistGameResults,
  type StatsPeriod,
  type StatsRow,
  toDateKey,
} from './game-result';

export interface AppState {
  currentGame: string | null;
  isGameGoing: boolean;
  currentLevel: number;
  currentScore: number;
  currentLives: number;
  gameResults: GameResult[];
  statsPeriod: StatsPeriod;
}

const initialState: AppState = {
  currentGame: null,
  isGameGoing: false,
  currentLevel: 1,
  currentScore: 0,
  currentLives: 3,
  gameResults: [],
  statsPeriod: 'today',
};

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => {
    const periodRows = computed<StatsRow[]>(() =>
      buildDailyRows(
        filterResultsByPeriod(store.gameResults(), store.statsPeriod()),
      ),
    );

    return {
      periodRows,
      periodTotals: computed<StatsRow>(() => aggregateStatsRows(periodRows())),
    };
  }),
  withMethods((store) => ({
    setCurrentGame(currentGame: string | null): void {
      patchState(store, { currentGame });
    },
    setIsGameGoing(isGameGoing: boolean): void {
      patchState(store, { isGameGoing });
    },
    setCurrentLevel(currentLevel: number): void {
      patchState(store, { currentLevel });
    },
    setCurrentScore(currentScore: number): void {
      patchState(store, { currentScore });
    },
    setCurrentLives(currentLives: number): void {
      patchState(store, { currentLives });
    },
    setStatsPeriod(statsPeriod: StatsPeriod): void {
      patchState(store, { statsPeriod });
    },
    loadResultsFromStorage(): void {
      patchState(store, { gameResults: loadGameResults() });
    },
    saveGameResult(result: Omit<GameResult, 'date'> & { date?: string }): void {
      const entry: GameResult = {
        date: result.date ?? toDateKey(),
        correct: result.correct,
        incorrect: result.incorrect,
        ...(result.game !== undefined ? { game: result.game } : {}),
      };
      const gameResults = [...store.gameResults(), entry];
      persistGameResults(gameResults);
      patchState(store, { gameResults });
    },
    resetGameState(): void {
      patchState(store, {
        currentGame: null,
        isGameGoing: false,
        currentLevel: 1,
        currentScore: 0,
        currentLives: 3,
      });
    },
  })),
  withHooks({
    onInit(store) {
      store.loadResultsFromStorage();
    },
  }),
);
