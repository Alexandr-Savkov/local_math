import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppStore } from '../../store/app.store';
import { GameHeader } from '../../ui/game-header/game-header';
import { MultiplicationTable, VariantTask } from './variant-task';

const TABLES: MultiplicationTable[] = [2, 3, 4, 5, 6];
const QUESTIONS_PER_SESSION = 10;
const POINTS_PER_ANSWER = 100;
const INITIAL_LIVES = 3;

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

@Component({
  selector: 'app-variants',
  imports: [GameHeader],
  templateUrl: './variants.html',
  styleUrl: './variants.scss',
})
export class Variants implements OnInit {
  private readonly router = inject(Router);
  protected readonly store = inject(AppStore);

  private allTasks: VariantTask[] = [];

  protected readonly questionsPerSession = QUESTIONS_PER_SESSION;

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly session = signal<VariantTask[]>([]);
  protected readonly questionIndex = signal(0);
  protected readonly wrongAnswers = signal<number[]>([]);

  protected readonly isGameOver = computed(
    () => !this.loading() && this.store.currentLives() <= 0,
  );
  protected readonly isFinished = computed(
    () =>
      !this.loading() &&
      this.session().length > 0 &&
      this.questionIndex() >= this.session().length,
  );
  protected readonly isPlaying = computed(
    () =>
      !this.loading() &&
      !this.loadError() &&
      !this.isGameOver() &&
      !this.isFinished(),
  );

  protected readonly currentTask = computed<VariantTask | null>(
    () => this.session()[this.questionIndex()] ?? null,
  );
  protected readonly currentVariants = computed<number[]>(() => {
    const task = this.currentTask();
    return task ? shuffle(task.variants) : [];
  });

  ngOnInit(): void {
    void this.startSession();
  }

  protected async startSession(): Promise<void> {
    this.store.setCurrentScore(0);
    this.store.setCurrentLives(INITIAL_LIVES);
    this.store.setIsGameGoing(true);
    this.questionIndex.set(0);
    this.wrongAnswers.set([]);
    this.loadError.set(false);

    if (this.allTasks.length === 0) {
      this.loading.set(true);
      try {
        this.allTasks = await this.loadTasks();
      } catch {
        this.loadError.set(true);
        this.loading.set(false);
        return;
      }
    }

    this.session.set(shuffle(this.allTasks).slice(0, QUESTIONS_PER_SESSION));
    this.loading.set(false);
  }

  protected onAnswer(variant: number): void {
    const task = this.currentTask();
    if (!task || !this.isPlaying() || this.wrongAnswers().includes(variant)) {
      return;
    }

    if (variant === task.answer) {
      this.store.setCurrentScore(this.store.currentScore() + POINTS_PER_ANSWER);
      this.wrongAnswers.set([]);
      this.questionIndex.update((index) => index + 1);
    } else {
      this.wrongAnswers.update((wrong) => [...wrong, variant]);
      this.store.setCurrentLives(Math.max(0, this.store.currentLives() - 1));
    }
  }

  protected async onPlayAgain(): Promise<void> {
    await this.startSession();
  }

  protected onLeave(): void {
    this.store.setIsGameGoing(false);
    void this.router.navigate(['/dashboard']);
  }

  private async loadTasks(): Promise<VariantTask[]> {
    const files = await Promise.all(
      TABLES.map(async (table) => {
        const response = await fetch(`tasks/variants/${table}.json`);
        if (!response.ok) {
          throw new Error(`Failed to load table ${table}`);
        }
        return (await response.json()) as VariantTask[];
      }),
    );
    return files.flat();
  }
}
