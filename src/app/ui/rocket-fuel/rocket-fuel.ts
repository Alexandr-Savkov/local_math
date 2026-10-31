import { Component, computed, input } from '@angular/core';

/** Inner fuel tank bounds inside the SVG viewBox. */
const TANK = { x: 78, y: 148, width: 44, height: 72 } as const;

@Component({
  selector: 'app-rocket-fuel',
  templateUrl: './rocket-fuel.html',
  styleUrl: './rocket-fuel.scss',
})
export class RocketFuel {
  /** Fuel level from 0 to 100. */
  readonly fuelPercent = input.required<number>();

  protected readonly tank = TANK;

  protected readonly clamped = computed(() =>
    Math.min(100, Math.max(0, Math.round(this.fuelPercent()))),
  );

  protected readonly fuelHeight = computed(
    () => (this.clamped() / 100) * TANK.height,
  );

  protected readonly fuelY = computed(
    () => TANK.y + TANK.height - this.fuelHeight(),
  );

  protected readonly label = computed(() => `${this.clamped()}%`);
}
