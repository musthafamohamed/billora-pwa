import { describe, expect, it } from 'vitest';
import { assertInvoiceWrite, InvoiceSaveQueue } from './invoiceSaving';
import type { Invoice } from './types';

const invoice = (notes: string, status: Invoice['status'] = 'DRAFT') => ({ id: 'i1', notes, status } as Invoice);

describe('invoice save ordering', () => {
  it('waits for an in-flight draft before finalizing and ignores later autosaves', async () => {
    const writes: string[] = [];
    let release!: () => void;
    const queue = new InvoiceSaveQueue(async inv => {
      if (inv.notes === 'old') await new Promise<void>(r => { release = r; });
      writes.push(`${inv.status}:${inv.notes}`);
    });
    const old = queue.draft(invoice('old'));
    await Promise.resolve();
    const final = queue.finish(invoice('latest', 'FINAL'));
    const late = queue.draft(invoice('late'));
    expect(writes).toEqual([]);
    release();
    await Promise.all([old, final, late]);
    expect(writes).toEqual(['DRAFT:old', 'FINAL:latest']);
  });

  it('continues saving the latest edit after a failed background save', async () => {
    const writes: string[] = [];
    const queue = new InvoiceSaveQueue(async inv => {
      if (inv.notes === 'failed') throw new Error('full');
      writes.push(inv.notes);
    });
    await expect(queue.draft(invoice('failed'))).rejects.toThrow('full');
    await queue.draft(invoice('latest'));
    expect(writes).toEqual(['latest']);
  });

  it('allows a retry after an explicit save fails', async () => {
    let full = true;
    const writes: string[] = [];
    const queue = new InvoiceSaveQueue(async inv => {
      if (full) throw new Error('full');
      writes.push(inv.status);
    });
    await expect(queue.finish(invoice('latest', 'FINAL'))).rejects.toThrow('full');
    full = false;
    await queue.finish(invoice('latest', 'FINAL'));
    expect(writes).toEqual(['FINAL']);
  });

  it('does not send queued drafts from an editor that was closed', async () => {
    let release!: () => void;
    const writes: string[] = [];
    const queue = new InvoiceSaveQueue(async inv => {
      if (inv.notes === 'running') await new Promise<void>(r => { release = r; });
      writes.push(inv.notes);
    });
    const running = queue.draft(invoice('running'));
    await Promise.resolve();
    const queued = queue.draft(invoice('queued'));
    queue.cancelPendingDrafts();
    release();
    await Promise.all([running, queued]);
    expect(writes).toEqual(['running']);
  });

});


describe('saved invoice immutability', () => {
  it('rejects stale autosaves and finalization after an invoice was finalized or cancelled', () => {
    for (const previous of ['FINAL', 'CANCELLED'] as const) {
      for (const next of ['DRAFT', 'FINAL'] as const) {
        expect(() => assertInvoiceWrite(invoice('stored', previous), invoice('stale', next))).toThrow();
      }
    }
  });

  it('allows finalizing a draft and cancelling a final invoice', () => {
    expect(() => assertInvoiceWrite(invoice('stored'), invoice('latest', 'FINAL'))).not.toThrow();
    expect(() => assertInvoiceWrite(invoice('stored', 'FINAL'), invoice('stored', 'CANCELLED'))).not.toThrow();
  });
});
