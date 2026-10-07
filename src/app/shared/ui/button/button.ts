import { Component } from '@angular/core';
import { ButtonDirective } from 'primeng/button';

@Component({
  selector: 'ng-button',
  imports: [ButtonDirective],
  template: `<button pButton>Check</button>`,
})
export class Button { }
