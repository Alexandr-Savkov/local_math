import { Routes } from '@angular/router';
import { Answer } from './games/answer/answer';
import { Timer } from './games/timer/timer';
import { Variants } from './games/variants/variants';
import { Dashboard } from './dashboard/dashboard';
import { Login } from './login/login';

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: Login },
  { path: 'dashboard', component: Dashboard },
  { path: 'games/variants', component: Variants },
  { path: 'games/answer', component: Answer },
  { path: 'games/timer', component: Timer },
  { path: '**', redirectTo: '' },
];
