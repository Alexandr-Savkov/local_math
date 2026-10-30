import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppStore } from '../../store/app.store';
import { GameHeader } from '../../ui/game-header/game-header';
import { MultiplicationTable, VariantTask } from './variant-task';

const QUESTIONS_PER_SESSION = 10;
const POINTS_PER_ANSWER = 100;
const INITIAL_LIVES = 3;

/** Easy → 2–4, Normal → 5–6, Rocket → all tables. */
const LEVEL_TABLES: Record<number, MultiplicationTable[]> = {
  1: [2, 3, 4],
  2: [5, 6],
  3: [2, 3, 4, 5, 6],
};

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
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

  private readonly tasksByTable = new Map<MultiplicationTable, VariantTask[]>();

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
    this.loading.set(true);

    try {
      this.session.set(await this.buildSession());
    } catch {
      this.loadError.set(true);
      this.loading.set(false);
      return;
    }

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

  private async buildSession(): Promise<VariantTask[]> {
    const level = this.store.currentLevel();
    const tables = LEVEL_TABLES[level] ?? LEVEL_TABLES[1]!;

    if (level === 3) {
      const allTasks = await this.loadTables(tables);
      return shuffle(allTasks).slice(0, QUESTIONS_PER_SESSION);
    }

    const table = pickRandom(tables);
    const tasks = await this.loadTables([table]);
    return tasks.slice(0, QUESTIONS_PER_SESSION);
  }

  private async loadTables(
    tables: readonly MultiplicationTable[],
  ): Promise<VariantTask[]> {
    const files = await Promise.all(
      tables.map(async (table) => {
        const cached = this.tasksByTable.get(table);
        if (cached) {
          return cached;
        }

        const response = await fetch(`tasks/variants/${table}.json`);
        if (!response.ok) {
          throw new Error(`Failed to load table ${table}`);
        }

        const tasks = (await response.json()) as VariantTask[];
        this.tasksByTable.set(table, tasks);
        return tasks;
      }),
    );
    return files.flat();
  }
}
