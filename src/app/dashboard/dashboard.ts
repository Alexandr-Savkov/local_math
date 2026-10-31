import { Component, computed, inject, signal } from '@angular/core';
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
    { id: 'variants', label: 'Варианты' },
    { id: 'answer', label: 'Ответ' },
    { id: 'timer', label: 'Таймер' },
  ];

  protected readonly levels: { id: ComplexityLevel; label: string }[] = [
    { id: 'easy', label: 'Лёгкий' },
    { id: 'normal', label: 'Обычный' },
    { id: 'rocket', label: 'Ракета' },
  ];

  private readonly levelImages: Record<ComplexityLevel, string> = {
    easy: 'images/easy_level.png',
    normal: 'images/normal_level.png',
    rocket: 'images/rocket_level.png',
  };

  protected readonly selectedGame = signal<GameType>('variants');
  protected readonly selectedLevel = signal<ComplexityLevel>('easy');

  protected readonly levelImageSrc = computed(
    () => this.levelImages[this.selectedLevel()],
  );

  protected readonly levelImageAlt = computed(() => {
    const label =
      this.levels.find((level) => level.id === this.selectedLevel())?.label ??
      this.selectedLevel();
    return `Уровень: ${label}`;
  });

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
