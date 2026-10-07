import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Button } from './shared/ui/button/button';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Button],
  template: `
  <h1>Hola Mundo</h1>
  <ng-button/>
  <router-outlet />
  `
})
export class App {}
