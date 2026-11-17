import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppStore } from '../../store/app.store';
import { GameHeader } from '../../ui/game-header/game-header';
import { RocketFuel } from '../../ui/rocket-fuel/rocket-fuel';
import {
  MultiplicationTable,
  VariantTask,
} from '../variants/variant-task';

const QUESTIONS_PER_SESSION = 10;
const POINTS_PER_ANSWER = 100;
const FUEL_PERCENT_PER_ANSWER = 10;
const INITIAL_LIVES = 3;
const MAX_INPUT_LENGTH = 4;

/** Easy → 2–4, Normal → 5–6, Rocket → all tables. */
const LEVEL_TABLES: Record<number, MultiplicationTable[]> = {
  1: [2, 3, 4],
  2: [5, 6],
  3: [2, 3, 4, 5, 6],
};

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

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
  selector: 'app-answer',
  imports: [GameHeader, RocketFuel],
  templateUrl: './answer.html',
  styleUrl: './answer.scss',
})
export class Answer implements OnInit {
  private readonly router = inject(Router);
  protected readonly store = inject(AppStore);

  private readonly tasksByTable = new Map<MultiplicationTable, VariantTask[]>();

  protected readonly questionsPerSession = QUESTIONS_PER_SESSION;
  protected readonly keypadKeys = KEYPAD_KEYS;

  /** +10% fuel per correct answer; capped at 100%. */
  protected readonly fuelPercent = computed(() =>
    Math.min(
      100,
      Math.round(
        (this.store.currentScore() / POINTS_PER_ANSWER) * FUEL_PERCENT_PER_ANSWER,
      ),
    ),
  );

  protected readonly hasStarted = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly session = signal<VariantTask[]>([]);
  protected readonly questionIndex = signal(0);
  protected readonly inputValue = signal('');
  protected readonly flashWrong = signal(false);
  protected readonly correctCount = signal(0);
  protected readonly incorrectCount = signal(0);
  private resultSaved = false;
  private flashTimeoutId: ReturnType<typeof setTimeout> | null = null;

  protected readonly isGameOver = computed(
    () =>
      this.hasStarted() && !this.loading() && this.store.currentLives() <= 0,
  );
  protected readonly isFinished = computed(
    () =>
      this.hasStarted() &&
      !this.loading() &&
      this.session().length > 0 &&
      this.questionIndex() >= this.session().length,
  );
  protected readonly isPlaying = computed(
    () =>
      this.hasStarted() &&
      !this.loading() &&
      !this.loadError() &&
      !this.isGameOver() &&
      !this.isFinished(),
  );

  protected readonly currentTask = computed<VariantTask | null>(
    () => this.session()[this.questionIndex()] ?? null,
  );

  protected readonly canSubmit = computed(
    () => this.isPlaying() && this.inputValue().length > 0,
  );

  ngOnInit(): void {
    this.store.setCurrentScore(0);
    this.store.setCurrentLives(INITIAL_LIVES);
    this.store.setIsGameGoing(false);
  }

  protected async onStart(): Promise<void> {
    this.hasStarted.set(true);
    await this.startSession();
  }

  protected async startSession(): Promise<void> {
    this.store.setCurrentScore(0);
    this.store.setCurrentLives(INITIAL_LIVES);
    this.store.setIsGameGoing(true);
    this.questionIndex.set(0);
    this.inputValue.set('');
    this.flashWrong.set(false);
    this.correctCount.set(0);
    this.incorrectCount.set(0);
    this.resultSaved = false;
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

  protected onKeypad(key: (typeof KEYPAD_KEYS)[number]): void {
    if (!this.isPlaying()) {
      return;
    }

    if (key === 'clear') {
      this.inputValue.set('');
      return;
    }

    if (key === 'back') {
      this.inputValue.update((value) => value.slice(0, -1));
      return;
    }

    this.inputValue.update((value) =>
      value.length >= MAX_INPUT_LENGTH ? value : `${value}${key}`,
    );
  }

  protected onSubmit(): void {
    const task = this.currentTask();
    const raw = this.inputValue();
    if (!task || !this.isPlaying() || raw.length === 0) {
      return;
    }

    const answer = Number(raw);
    if (!Number.isFinite(answer)) {
      return;
    }

    if (answer === task.answer) {
      this.store.setCurrentScore(this.store.currentScore() + POINTS_PER_ANSWER);
      this.correctCount.update((count) => count + 1);
      this.inputValue.set('');
      const nextIndex = this.questionIndex() + 1;
      this.questionIndex.set(nextIndex);
      if (nextIndex >= this.session().length) {
        this.saveSessionResult();
      }
    } else {
      this.incorrectCount.update((count) => count + 1);
      this.inputValue.set('');
      this.triggerFlashWrong();
      const lives = Math.max(0, this.store.currentLives() - 1);
      this.store.setCurrentLives(lives);
      if (lives <= 0) {
        this.saveSessionResult();
      }
    }
  }

  protected async onPlayAgain(): Promise<void> {
    await this.startSession();
  }

  protected onLeave(): void {
    this.store.setIsGameGoing(false);
    void this.router.navigate(['/dashboard']);
  }

  protected keypadLabel(key: (typeof KEYPAD_KEYS)[number]): string {
    if (key === 'clear') {
      return 'C';
    }
    if (key === 'back') {
      return '⌫';
    }
    return key;
  }

  private triggerFlashWrong(): void {
    if (this.flashTimeoutId !== null) {
      clearTimeout(this.flashTimeoutId);
    }
    this.flashWrong.set(false);
    // Retrigger CSS animation when answers are wrong in a row.
    requestAnimationFrame(() => {
      this.flashWrong.set(true);
      this.flashTimeoutId = setTimeout(() => {
        this.flashWrong.set(false);
        this.flashTimeoutId = null;
      }, 280);
    });
  }

  private saveSessionResult(): void {
    if (this.resultSaved) {
      return;
    }

    this.resultSaved = true;
    this.store.saveGameResult({
      game: 'answer',
      correct: this.correctCount(),
      incorrect: this.incorrectCount(),
    });
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
