import { Component, effect, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-game-header',
  templateUrl: './game-header.html',
  styleUrl: './game-header.scss',
})
export class GameHeader {
  readonly score = input.required<number>();
  readonly lives = input<number | null>(null);
  readonly showLives = input(true);

  readonly leave = output<void>();

  protected readonly scorePop = signal(false);
  protected readonly scoreDrop = signal(false);

  private previousScore = 0;

  constructor() {
    effect(() => {
      const current = this.score();
      if (current > this.previousScore) {
        this.scoreDrop.set(false);
        this.scorePop.set(false);
        requestAnimationFrame(() => this.scorePop.set(true));
      } else if (current < this.previousScore) {
        this.scorePop.set(false);
        this.scoreDrop.set(false);
        requestAnimationFrame(() => this.scoreDrop.set(true));
      }
      this.previousScore = current;
    });
  }

  protected onLeave(): void {
    this.leave.emit();
  }

  protected onScoreAnimEnd(): void {
    this.scorePop.set(false);
    this.scoreDrop.set(false);
  }
}
