import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Reports from './Reports';
import { emptyProfile } from '../lib/types';

vi.mock('../lib/store', () => ({ useStore: () => ({ invoices: [], products: [], profile: { ...emptyProfile(), businessName: 'Print Test Business' } }) }));

let root: Root;
let host: HTMLDivElement;
let blobs: Blob[];

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  blobs = [];
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: (blob: Blob) => { blobs.push(blob); return 'blob:report-print'; },
    revokeObjectURL: vi.fn(),
  }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(<Reports />); });
});

afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(e => e.textContent?.trim() === label);
  expect(button, `${label} action should be available`).toBeTruthy();
  await act(async () => { button!.click(); });
}

it('prints the selected report and filters through the same PDF viewer as invoices', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue({ closed: false, opener: null } as unknown as Window);
  const pagePrint = vi.spyOn(window, 'print').mockImplementation(() => {});
  const type = host.querySelector('select')!;
  await act(async () => { type.value = 'NON_TAX'; type.dispatchEvent(new Event('change', {bubbles: true})); });
  for (const [tab, title] of [['Invoice Summary', 'Invoice Summary Report'], ['Item-wise', 'Item-wise Report'], ['HSN-wise', 'HSN-wise Report']]) {
    await click(tab); await click('Print PDF');
    const blob = blobs[blobs.length - 1];
    expect(blob.type).toBe('application/pdf');
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    expect(text).toContain(title);
    expect(text).toContain('Without Tax');
    expect(text).toContain('Net totals for the selected filters');
  }
  expect(open).toHaveBeenCalledTimes(3);
  expect(pagePrint).not.toHaveBeenCalled();
});

it('shows a recoverable download option if report printing is blocked', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  await click('Print PDF');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Export PDF');
});
