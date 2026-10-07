import { Component, input } from '@angular/core';

@Component({
  selector: 'app-collection-metric',
  host: { class: 'block min-w-0' },
  template: `
    <div class="h-full border-l-2 px-3 py-1" [class]="accentClass()">
      <div class="flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
        <i [class]="icon()" aria-hidden="true"></i>
        <span>{{ label() }}</span>
      </div>
      <p class="mt-1 mb-0 truncate text-xl font-semibold tabular-nums text-surface-950 dark:text-surface-0">
        {{ value() }}
      </p>
      <p class="mt-0.5 mb-0 text-xs text-surface-500 dark:text-surface-400">
        {{ hint() }}
      </p>
    </div>
  `,
})
export class CollectionMetric {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input.required<string>();
  readonly icon = input.required<string>();
  readonly accentClass = input('border-primary-500');
}
