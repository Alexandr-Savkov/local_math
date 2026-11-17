import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppStore } from '../store/app.store';
import { formatStatsDate, type StatsPeriod } from '../store/game-result';

@Component({
  selector: 'app-statistics',
  templateUrl: './statistics.html',
  styleUrl: './statistics.scss',
})
export class Statistics {
  private readonly router = inject(Router);
  protected readonly store = inject(AppStore);

  protected readonly periods: { id: StatsPeriod; label: string }[] = [
    { id: 'today', label: 'За сегодня' },
    { id: '7days', label: 'За 7 дней' },
    { id: '30days', label: 'За 30 дней' },
  ];

  protected readonly formatDate = formatStatsDate;

  protected selectPeriod(period: StatsPeriod): void {
    this.store.setStatsPeriod(period);
  }

  protected onBack(): void {
    void this.router.navigate(['/dashboard']);
  }
}
