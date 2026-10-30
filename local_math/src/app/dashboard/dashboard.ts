import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppStore } from '../store/app.store';

export type GameType = 'variants' | 'answer' | 'timer';
export type ComplexityLevel = 'easy' | 'normal' | 'rocket';

const LEVEL_TO_NUMBER: Record<ComplexityLevel, number> = {
  easy: 1,
  normal: 2,
  rocket: 3,
};

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly router = inject(Router);
  private readonly store = inject(AppStore);

  protected readonly games: { id: GameType; label: string }[] = [
    { id: 'variants', label: 'Variants' },
    { id: 'answer', label: 'Answer' },
    { id: 'timer', label: 'Timer' },
  ];

  protected readonly levels: { id: ComplexityLevel; label: string }[] = [
    { id: 'easy', label: 'Easy' },
    { id: 'normal', label: 'Normal' },
    { id: 'rocket', label: 'Rocket' },
  ];

  protected readonly selectedGame = signal<GameType>('variants');
  protected readonly selectedLevel = signal<ComplexityLevel>('easy');

  protected selectGame(game: GameType): void {
    this.selectedGame.set(game);
  }

  protected selectLevel(level: ComplexityLevel): void {
    this.selectedLevel.set(level);
  }

  protected onNext(): void {
    const game = this.selectedGame();
    const level = this.selectedLevel();

    this.store.setCurrentGame(game);
    this.store.setCurrentLevel(LEVEL_TO_NUMBER[level]);
    this.store.setIsGameGoing(true);

    void this.router.navigate(['/games', game]);
  }
}
