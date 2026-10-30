import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

const MOCK_USERNAME = 'Misha';
const MOCK_PASSWORD = 'monkey-misha';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly error = signal('');

  constructor(private readonly router: Router) {}

  protected onSubmit(event: Event): void {
    event.preventDefault();

    const username = this.username().trim();
    const password = this.password();

    if (username === MOCK_USERNAME && password === MOCK_PASSWORD) {
      this.error.set('');
      void this.router.navigate(['/dashboard']);
      return;
    }

    this.error.set('Invalid username or password');
  }
}
