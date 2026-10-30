import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppStore } from '../../store/app.store';
import { GameHeader } from '../../ui/game-header/game-header';

@Component({
  selector: 'app-answer',
  imports: [GameHeader],
  templateUrl: './answer.html',
  styleUrl: './answer.scss',
})
export class Answer {
  private readonly router = inject(Router);
  protected readonly store = inject(AppStore);

  protected onLeave(): void {
    this.store.setIsGameGoing(false);
    void this.router.navigate(['/dashboard']);
  }
}
