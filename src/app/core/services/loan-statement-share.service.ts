import { Service } from '@angular/core';
import { buildLoanStatementText, loanStatementFileName } from '../calculations/loan-statement';
import { LoanDetail } from '../models/loan.model';

export type LoanStatementShareResult = 'done' | 'cancelled';

const MIME_TEXT = 'text/plain';
const SHARE_TITLE = 'Estado de cuenta del préstamo';

@Service()
export class LoanStatementShareService {
  canShareText(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  }

  /** Only some mobile browsers can attach a file to the native share sheet. */
  canShareFile(): boolean {
    if (
      !this.canShareText() ||
      typeof navigator.canShare !== 'function' ||
      typeof File === 'undefined'
    ) {
      return false;
    }
    return navigator.canShare({
      files: [new File([''], 'estado-de-cuenta.txt', { type: MIME_TEXT })],
    });
  }

  canCopy(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function';
  }

  shareText(detail: LoanDetail, issuedAt = new Date()): Promise<LoanStatementShareResult> {
    return this.share({ title: SHARE_TITLE, text: buildLoanStatementText(detail, issuedAt) });
  }

  shareFile(detail: LoanDetail, issuedAt = new Date()): Promise<LoanStatementShareResult> {
    const file = new File(
      [buildLoanStatementText(detail, issuedAt)],
      loanStatementFileName(detail, issuedAt),
      { type: MIME_TEXT },
    );
    return this.share({ title: SHARE_TITLE, files: [file] });
  }

  async copy(detail: LoanDetail, issuedAt = new Date()): Promise<void> {
    await navigator.clipboard.writeText(buildLoanStatementText(detail, issuedAt));
  }

  download(detail: LoanDetail, issuedAt = new Date()): void {
    const blob = new Blob([buildLoanStatementText(detail, issuedAt)], {
      type: `${MIME_TEXT};charset=utf-8`,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = loanStatementFileName(detail, issuedAt);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Revoking right away can cancel the download in some mobile browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async share(data: ShareData): Promise<LoanStatementShareResult> {
    try {
      await navigator.share(data);
      return 'done';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
      throw error;
    }
  }
}
