import type { Invoice } from './types';

/** One editor's writes run in order; an explicit save/finalize is the final
 * write, so a delayed background draft cannot downgrade it. */
export class InvoiceSaveQueue {
  private pending = Promise.resolve();
  private completion: Promise<void> | null = null;
  private generation = 0;
  constructor(private save: (invoice: Invoice) => Promise<void>) {}

  draft(invoice: Invoice): Promise<void> {
    if (this.completion) return Promise.resolve();
    const generation = this.generation;
    return this.enqueue(() => generation === this.generation ? this.save(invoice) : Promise.resolve());
  }

  finish(invoice: Invoice): Promise<void> {
    if (this.completion) return this.completion;
    this.cancelPendingDrafts();
    this.completion = this.enqueue(() => this.save(invoice)).catch(error => { this.completion = null; throw error; });
    return this.completion;
  }

  cancelPendingDrafts(): void { this.generation += 1; }

  private enqueue(write: () => Promise<void>): Promise<void> {
    const next = this.pending.then(write);
    this.pending = next.catch(() => {});
    return next;
  }
}

export function assertInvoiceWrite(previous: Invoice | undefined, next: Invoice): void {
  if (previous && previous.status !== 'DRAFT'
    && !(previous.status === 'FINAL' && next.status === 'CANCELLED')) {
    throw new Error('This invoice is already final or cancelled. Reload it before making changes.');
  }
}
