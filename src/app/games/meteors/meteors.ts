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
import { todayCorrectCount } from '../../store/game-result';
import { GameHeader } from '../../ui/game-header/game-header';
import { MultiplicationTable, VariantTask } from '../variants/variant-task';

const QUESTIONS_PER_SESSION = 10;
const POINTS_PER_ANSWER = 100;
const INITIAL_LIVES = 3;
/** Correct answers in other games today required to unlock Asteroids. */
const UNLOCK_CORRECT_REQUIRED = 20;
const CRASH_MS = 1500;
const DESTROY_MS = 380;
const WRONG_FLASH_MS = 320;
const BASE_FALL_SPEED = 0.0004; // fraction of arena height per frame (~60fps → ~9s)
const CRASH_SPEED_MULT = 5.5;
/** Max columns so ~6.5rem asteroids fit without horizontal overlap on phones. */
const LAYOUT_COLS = 3;
/** Minimum vertical gap in progress units (~asteroid diameter). */
const VERTICAL_GAP = 0.15;
/** Asteroid progress at which it reaches the rocket and ends the game. */
const SHIP_HIT_PROGRESS = 0.72;
const ASTEROID_IMAGES = [
  'images/asteroid_1.png',
  'images/asteroid_2.png',
  'images/asteroid_3.png',
] as const;

/** Easy → 2–4, Normal → 5–6, Rocket → all tables. */
const LEVEL_TABLES: Record<number, MultiplicationTable[]> = {
  1: [2, 3, 4],
  2: [5, 6],
  3: [2, 3, 4, 5, 6],
};

export interface MeteorAsteroid {
  id: number;
  value: number;
  image: string;
  /** Horizontal position as percent of arena width. */
  left: number;
  /** Vertical progress 0 → 1+ through the arena. */
  progress: number;
  /** Fall speed multiplier. */
  speed: number;
  /** Base rotation in degrees. */
  rotate: number;
  /** Relative size scale. */
  scale: number;
  hitWrong: boolean;
  destroying: boolean;
}

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

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

@Component({
  selector: 'app-meteors',
  imports: [GameHeader],
  templateUrl: './meteors.html',
  styleUrl: './meteors.scss',
})
export class Meteors implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  protected readonly store = inject(AppStore);

  private readonly tasksByTable = new Map<MultiplicationTable, VariantTask[]>();
  private crashTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private destroyTimeoutIds = new Set<ReturnType<typeof setTimeout>>();
  private wrongTimeoutIds = new Set<ReturnType<typeof setTimeout>>();
  private rafId: number | null = null;
  private lastFrameTs = 0;
  private resultSaved = false;
  private nextAsteroidId = 0;
  private speedMult = 1;

  protected readonly questionsPerSession = QUESTIONS_PER_SESSION;
  protected readonly unlockCorrectRequired = UNLOCK_CORRECT_REQUIRED;
  protected readonly Math = Math;

  /** Correct answers today from games other than Asteroids. */
  protected readonly todayCorrect = computed(() =>
    todayCorrectCount(this.store.gameResults(), { excludeGame: 'meteors' }),
  );

  protected readonly isUnlocked = computed(
    () => this.todayCorrect() >= UNLOCK_CORRECT_REQUIRED,
  );

  protected readonly hasStarted = signal(false);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly session = signal<VariantTask[]>([]);
  protected readonly questionIndex = signal(0);
  protected readonly asteroids = signal<MeteorAsteroid[]>([]);
  protected readonly isCrashing = signal(false);
  protected readonly shipHit = signal(false);
  protected readonly correctCount = signal(0);
  protected readonly incorrectCount = signal(0);

  protected readonly isGameOver = computed(
    () =>
      this.hasStarted() &&
      !this.loading() &&
      !this.isCrashing() &&
      this.store.currentLives() <= 0,
  );
  protected readonly isFinished = computed(
    () =>
      this.hasStarted() &&
      !this.loading() &&
      this.session().length > 0 &&
      this.questionIndex() >= this.session().length &&
      this.store.currentLives() > 0,
  );
  protected readonly isPlaying = computed(
    () =>
      this.hasStarted() &&
      !this.loading() &&
      !this.loadError() &&
      !this.isGameOver() &&
      !this.isFinished() &&
      !this.isCrashing(),
  );

  protected readonly currentTask = computed<VariantTask | null>(
    () => this.session()[this.questionIndex()] ?? null,
  );

  /** Prev/next allowed while more than one unanswered question remains. */
  protected readonly canCycleQuestion = computed(() => {
    if (!this.isPlaying()) {
      return false;
    }
    return this.questionIndex() < this.session().length - 1;
  });

  ngOnInit(): void {
    this.store.setCurrentScore(0);
    this.store.setCurrentLives(INITIAL_LIVES);
    this.store.setIsGameGoing(false);
  }

  ngOnDestroy(): void {
    this.stopLoop();
    this.clearCrashTimeout();
    this.clearDestroyTimeouts();
    this.clearWrongTimeouts();
  }

  protected async onStart(): Promise<void> {
    if (!this.isUnlocked()) {
      return;
    }
    this.hasStarted.set(true);
    await this.startSession();
  }

  protected async startSession(): Promise<void> {
    if (!this.isUnlocked()) {
      this.hasStarted.set(false);
      this.store.setIsGameGoing(false);
      return;
    }

    this.stopLoop();
    this.clearCrashTimeout();
    this.clearDestroyTimeouts();
    this.clearWrongTimeouts();
    this.store.setCurrentScore(0);
    this.store.setCurrentLives(INITIAL_LIVES);
    this.store.setIsGameGoing(true);
    this.questionIndex.set(0);
    this.asteroids.set([]);
    this.isCrashing.set(false);
    this.shipHit.set(false);
    this.correctCount.set(0);
    this.incorrectCount.set(0);
    this.resultSaved = false;
    this.nextAsteroidId = 0;
    this.speedMult = 1;
    this.loadError.set(false);
    this.loading.set(true);

    try {
      const session = await this.buildSession();
      this.session.set(session);
      this.asteroids.set(this.buildAsteroids(session));
    } catch {
      this.loadError.set(true);
      this.loading.set(false);
      this.store.setIsGameGoing(false);
      return;
    }

    this.loading.set(false);
    this.startLoop();
  }

  protected asteroidTransform(asteroid: MeteorAsteroid): string {
    const scale = asteroid.destroying ? asteroid.scale * 0.2 : asteroid.scale;
    return `translateY(-50%) rotate(${asteroid.rotate}deg) scale(${scale})`;
  }

  protected onAsteroidClick(asteroid: MeteorAsteroid): void {
    const task = this.currentTask();
    if (!task || !this.isPlaying() || asteroid.destroying || asteroid.hitWrong) {
      return;
    }

    if (asteroid.value === task.answer) {
      this.handleCorrect(asteroid);
      return;
    }

    this.handleWrong(asteroid);
  }

  /** Move the current question to the end of the queue and show the next one. */
  protected onSkipQuestion(): void {
    if (!this.canCycleQuestion()) {
      return;
    }

    const index = this.questionIndex();
    const tasks = [...this.session()];
    const [current] = tasks.splice(index, 1);
    if (!current) {
      return;
    }

    tasks.push(current);
    this.session.set(tasks);
    // After splice, the former next item sits at the same index.
    this.questionIndex.set(index);
  }

  /** Bring the last queued question back to the current slot. */
  protected onPreviousQuestion(): void {
    if (!this.canCycleQuestion()) {
      return;
    }

    const index = this.questionIndex();
    const tasks = [...this.session()];
    const previous = tasks.pop();
    if (!previous) {
      return;
    }

    tasks.splice(index, 0, previous);
    this.session.set(tasks);
    this.questionIndex.set(index);
  }

  protected async onPlayAgain(): Promise<void> {
    await this.startSession();
  }

  protected onLeave(): void {
    this.stopLoop();
    this.clearCrashTimeout();
    this.clearDestroyTimeouts();
    this.clearWrongTimeouts();
    this.store.setIsGameGoing(false);
    void this.router.navigate(['/dashboard']);
  }

  private handleCorrect(asteroid: MeteorAsteroid): void {
    this.store.setCurrentScore(this.store.currentScore() + POINTS_PER_ANSWER);
    this.correctCount.update((count) => count + 1);
    this.markDestroying(asteroid.id);

    const nextIndex = this.questionIndex() + 1;
    this.questionIndex.set(nextIndex);
    if (nextIndex >= this.session().length) {
      this.stopLoop();
      this.store.setIsGameGoing(false);
      this.saveSessionResult();
      return;
    }

    // If a later task shares this answer, keep one live asteroid with that value.
    this.ensureAnswerAvailable(this.session()[nextIndex]!.answer, asteroid.id);
  }

  /** When duplicates exist, retarget a remaining asteroid so the next answer is still clickable. */
  private ensureAnswerAvailable(answer: number, destroyingId: number): void {
    const remaining = this.asteroids().filter(
      (item) => item.id !== destroyingId && !item.destroying,
    );
    if (remaining.some((item) => item.value === answer)) {
      return;
    }
    if (remaining.length === 0) {
      return;
    }

    const targetId = pickRandom(remaining).id;
    this.asteroids.update((list) =>
      list.map((item) =>
        item.id === targetId ? { ...item, value: answer } : item,
      ),
    );
  }

  private handleWrong(asteroid: MeteorAsteroid): void {
    this.incorrectCount.update((count) => count + 1);
    this.flashWrongAsteroid(asteroid.id);

    const lives = Math.max(0, this.store.currentLives() - 1);
    this.store.setCurrentLives(lives);
    if (lives <= 0) {
      this.beginCrash();
    }
  }

  private markDestroying(id: number): void {
    this.asteroids.update((list) =>
      list.map((item) =>
        item.id === id ? { ...item, destroying: true, hitWrong: false } : item,
      ),
    );

    const timeoutId = setTimeout(() => {
      this.destroyTimeoutIds.delete(timeoutId);
      this.asteroids.update((list) => list.filter((item) => item.id !== id));
    }, DESTROY_MS);
    this.destroyTimeoutIds.add(timeoutId);
  }

  private flashWrongAsteroid(id: number): void {
    this.asteroids.update((list) =>
      list.map((item) =>
        item.id === id ? { ...item, hitWrong: true } : item,
      ),
    );

    const timeoutId = setTimeout(() => {
      this.wrongTimeoutIds.delete(timeoutId);
      this.asteroids.update((list) =>
        list.map((item) =>
          item.id === id ? { ...item, hitWrong: false } : item,
        ),
      );
    }, WRONG_FLASH_MS);
    this.wrongTimeoutIds.add(timeoutId);
  }

  private beginCrash(): void {
    this.isCrashing.set(true);
    this.speedMult = CRASH_SPEED_MULT;
    this.store.setIsGameGoing(false);
    this.saveSessionResult();

    this.clearCrashTimeout();
    this.crashTimeoutId = setTimeout(() => {
      this.shipHit.set(true);
      this.crashTimeoutId = setTimeout(() => {
        this.crashTimeoutId = null;
        this.stopLoop();
        this.isCrashing.set(false);
      }, 480);
    }, CRASH_MS);
  }

  private saveSessionResult(): void {
    if (this.resultSaved) {
      return;
    }

    this.resultSaved = true;
    this.store.saveGameResult({
      game: 'meteors',
      correct: this.correctCount(),
      incorrect: this.incorrectCount(),
    });
  }

  private buildAsteroids(session: readonly VariantTask[]): MeteorAsteroid[] {
    const layout = this.buildNonOverlappingLayout(session.length);

    return session.map((task, index) => {
      const slot = layout[index]!;
      return {
        id: this.nextAsteroidId++,
        value: task.answer,
        image: pickRandom(ASTEROID_IMAGES),
        left: slot.left,
        progress: slot.progress,
        // Same speed keeps relative gaps so asteroids never catch up.
        speed: 1,
        rotate: randomBetween(-20, 20),
        scale: 1,
        hitWrong: false,
        destroying: false,
      };
    });
  }

  /** Grid of lanes + staggered rows so sprites never start on top of each other. */
  private buildNonOverlappingLayout(
    count: number,
  ): { left: number; progress: number }[] {
    const cols = Math.min(LAYOUT_COLS, Math.max(1, count));
    const leftMin = 8;
    const leftMax = 78;
    const leftStep = cols === 1 ? 0 : (leftMax - leftMin) / (cols - 1);

    const order = shuffle(Array.from({ length: count }, (_, index) => index));

    return order.map((index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        left: leftMin + col * leftStep,
        progress: -0.12 - row * VERTICAL_GAP,
      };
    });
  }

  private startLoop(): void {
    this.stopLoop();
    this.lastFrameTs = performance.now();
    const tick = (ts: number) => {
      const dt = Math.min(0.05, (ts - this.lastFrameTs) / 1000);
      this.lastFrameTs = ts;
      this.advanceAsteroids(dt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private advanceAsteroids(dt: number): void {
    if (this.asteroids().length === 0) {
      return;
    }

    const step = BASE_FALL_SPEED * 60 * dt * this.speedMult;
    let reachedShip = false;

    this.asteroids.update((list) =>
      list.map((asteroid) => {
        if (asteroid.destroying) {
          return asteroid;
        }

        const progress = asteroid.progress + step * asteroid.speed;
        if (!this.isCrashing() && progress >= SHIP_HIT_PROGRESS) {
          reachedShip = true;
        }

        return {
          ...asteroid,
          progress,
          rotate: asteroid.rotate + dt * 28 * asteroid.speed * this.speedMult,
        };
      }),
    );

    if (reachedShip) {
      this.onShipReached();
    }
  }

  /** Any asteroid at rocket height burns all lives and ends the run. */
  private onShipReached(): void {
    if (this.isCrashing() || this.isGameOver() || this.isFinished()) {
      return;
    }

    this.store.setCurrentLives(0);
    this.beginCrash();
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
    return shuffle(tasks).slice(0, QUESTIONS_PER_SESSION);
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

  private clearCrashTimeout(): void {
    if (this.crashTimeoutId !== null) {
      clearTimeout(this.crashTimeoutId);
      this.crashTimeoutId = null;
    }
  }

  private clearDestroyTimeouts(): void {
    for (const id of this.destroyTimeoutIds) {
      clearTimeout(id);
    }
    this.destroyTimeoutIds.clear();
  }

  private clearWrongTimeouts(): void {
    for (const id of this.wrongTimeoutIds) {
      clearTimeout(id);
    }
    this.wrongTimeoutIds.clear();
  }
}
