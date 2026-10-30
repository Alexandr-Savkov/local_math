import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-game-header',
  templateUrl: './game-header.html',
  styleUrl: './game-header.scss',
})
export class GameHeader {
  readonly score = input.required<number>();
  readonly lives = input.required<number>();

  readonly leave = output<void>();

  protected onLeave(): void {
    this.leave.emit();
  }
}
