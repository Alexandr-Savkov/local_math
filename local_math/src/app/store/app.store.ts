import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

export interface AppState {
  currentGame: string | null;
  isGameGoing: boolean;
  currentLevel: number;
  currentScore: number;
  currentLives: number;
}

const initialState: AppState = {
  currentGame: null,
  isGameGoing: false,
  currentLevel: 1,
  currentScore: 0,
  currentLives: 3,
};

export const AppStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
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
    resetGameState(): void {
      patchState(store, initialState);
    },
  })),
);
