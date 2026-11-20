import { Directive, ElementRef, inject } from '@angular/core';

@Directive({
  selector: 'input[appDigitsOnly]',
  host: {
    '(beforeinput)': 'onBeforeInput($event)',
    '(paste)': 'onPaste($event)',
    '(input)': 'onInput()',
  },
})
export class DigitsOnly {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  protected onBeforeInput(event: InputEvent): void {
    if (event.inputType.startsWith('insert') && event.data !== null && /\D/.test(event.data)) {
      event.preventDefault();
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    const digits = event.clipboardData?.getData('text').replace(/\D/g, '') ?? '';
    event.preventDefault();

    const start = this.element.selectionStart ?? this.element.value.length;
    const end = this.element.selectionEnd ?? start;
    this.element.setRangeText(digits, start, end, 'end');
    this.element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  protected onInput(): void {
    const sanitized = this.element.value.replace(/\D/g, '');
    if (sanitized === this.element.value) return;

    const caret = this.element.selectionStart ?? sanitized.length;
    const removedBeforeCaret = this.element.value.slice(0, caret).replace(/\d/g, '').length;
    this.element.value = sanitized;
    this.element.setSelectionRange(caret - removedBeforeCaret, caret - removedBeforeCaret);
    this.element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
