import {
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AppStore } from '../../store/app.store';
import { GameHeader } from '../../ui/game-header/game-header';
import { MultiplicationTable, VariantTask } from '../variants/variant-task';

const SESSION_SECONDS = 30;
const POINTS_CORRECT = 100;
const POINTS_WRONG = 50;
const FLASH_MS = 280;

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

@Component({
  selector: 'app-timer',
  imports: [GameHeader],
  templateUrl: './timer.html',
  styleUrl: './timer.scss',
})
export class Timer implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  protected readonly store = inject(AppStore);

  private readonly tasksByTable = new Map<MultiplicationTable, VariantTask[]>();
  private countdownId: ReturnType<typeof setInterval> | null = null;
  private flashTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private taskPool: VariantTask[] = [];
  private poolIndex = 0;

  protected readonly hasStarted = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly secondsLeft = signal(SESSION_SECONDS);
  protected readonly currentTask = signal<VariantTask | null>(null);
  protected readonly currentVariants = signal<number[]>([]);
  protected readonly flashWrong = signal(false);
  protected readonly flashCorrect = signal(false);
  protected readonly isFinished = signal(false);

  protected readonly isPlaying = computed(
    () =>
      this.hasStarted() &&
      !this.loading() &&
      !this.loadError() &&
      !this.isFinished() &&
      this.currentTask() !== null,
  );

  ngOnInit(): void {
    this.store.setCurrentScore(0);
    this.store.setIsGameGoing(false);
  }

  ngOnDestroy(): void {
    this.clearCountdown();
    this.clearFlashTimeout();
  }

  protected async onStart(): Promise<void> {
    this.hasStarted.set(true);
    await this.startSession();
  }

  protected async startSession(): Promise<void> {
    this.clearCountdown();
    this.clearFlashTimeout();
    this.store.setCurrentScore(0);
    this.store.setIsGameGoing(true);
    this.secondsLeft.set(SESSION_SECONDS);
    this.isFinished.set(false);
    this.flashWrong.set(false);
    this.flashCorrect.set(false);
    this.currentTask.set(null);
    this.currentVariants.set([]);
    this.loadError.set(false);
    this.loading.set(true);

    try {
      this.taskPool = shuffle(await this.loadLevelTasks());
      this.poolIndex = 0;
      if (this.taskPool.length === 0) {
        throw new Error('No tasks available');
      }
      this.nextQuestion();
    } catch {
      this.loadError.set(true);
      this.loading.set(false);
      this.store.setIsGameGoing(false);
      return;
    }

    this.loading.set(false);
    this.startCountdown();
  }

  protected onAnswer(variant: number): void {
    const task = this.currentTask();
    if (!task || !this.isPlaying()) {
      return;
    }

    if (variant === task.answer) {
      this.store.setCurrentScore(this.store.currentScore() + POINTS_CORRECT);
      this.triggerFlash('correct');
      this.nextQuestion();
      return;
    }

    this.store.setCurrentScore(
      Math.max(0, this.store.currentScore() - POINTS_WRONG),
    );
    this.triggerFlash('wrong');
    this.nextQuestion();
  }

  protected async onPlayAgain(): Promise<void> {
    await this.startSession();
  }

  protected onLeave(): void {
    this.clearCountdown();
    this.clearFlashTimeout();
    this.store.setIsGameGoing(false);
    void this.router.navigate(['/dashboard']);
  }

  private startCountdown(): void {
    this.clearCountdown();
    this.countdownId = setInterval(() => {
      const next = this.secondsLeft() - 1;
      if (next <= 0) {
        this.secondsLeft.set(0);
        this.finishSession();
        return;
      }
      this.secondsLeft.set(next);
    }, 1000);
  }

  private finishSession(): void {
    this.clearCountdown();
    this.clearFlashTimeout();
    this.flashWrong.set(false);
    this.flashCorrect.set(false);
    this.isFinished.set(true);
    this.store.setIsGameGoing(false);
  }

  private nextQuestion(): void {
    if (this.taskPool.length === 0) {
      return;
    }

    if (this.poolIndex >= this.taskPool.length) {
      this.taskPool = shuffle(this.taskPool);
      this.poolIndex = 0;
    }

    const task = this.taskPool[this.poolIndex++]!;
    this.currentTask.set(task);
    this.currentVariants.set(shuffle(task.variants));
  }

  private triggerFlash(kind: 'correct' | 'wrong'): void {
    this.clearFlashTimeout();
    this.flashWrong.set(false);
    this.flashCorrect.set(false);
    requestAnimationFrame(() => {
      if (kind === 'correct') {
        this.flashCorrect.set(true);
      } else {
        this.flashWrong.set(true);
      }
      this.flashTimeoutId = setTimeout(() => {
        this.flashWrong.set(false);
        this.flashCorrect.set(false);
        this.flashTimeoutId = null;
      }, FLASH_MS);
    });
  }

  private clearCountdown(): void {
    if (this.countdownId !== null) {
      clearInterval(this.countdownId);
      this.countdownId = null;
    }
  }

  private clearFlashTimeout(): void {
    if (this.flashTimeoutId !== null) {
      clearTimeout(this.flashTimeoutId);
      this.flashTimeoutId = null;
    }
  }

  private async loadLevelTasks(): Promise<VariantTask[]> {
    const level = this.store.currentLevel();
    const tables = LEVEL_TABLES[level] ?? LEVEL_TABLES[1]!;
    return this.loadTables(tables);
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
