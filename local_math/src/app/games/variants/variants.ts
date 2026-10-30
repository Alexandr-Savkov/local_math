import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppStore } from '../../store/app.store';
import { GameHeader } from '../../ui/game-header/game-header';

@Component({
  selector: 'app-variants',
  imports: [GameHeader],
  templateUrl: './variants.html',
  styleUrl: './variants.scss',
})
export class Variants {
  private readonly router = inject(Router);
  protected readonly store = inject(AppStore);

  protected onLeave(): void {
    this.store.setIsGameGoing(false);
    void this.router.navigate(['/dashboard']);
  }
}
