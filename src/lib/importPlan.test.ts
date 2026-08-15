import { describe, it, expect } from 'vitest';
import { planImportAction } from './importPlan';

describe('planImportAction', () => {
  it('inserts open rows only when nothing exists yet', () => {
    expect(planImportAction('none', 'open')).toBe('insert');
    expect(planImportAction('open', 'open')).toBe('skip');
    expect(planImportAction('closed', 'open')).toBe('skip');
  });

  it('upgrades an open trade when its closed/history row arrives', () => {
    expect(planImportAction('open', 'closed')).toBe('upgrade');
  });

  it('skips closed rows already imported as closed', () => {
    expect(planImportAction('closed', 'closed')).toBe('skip');
  });

  it('inserts closed rows with no existing trade', () => {
    expect(planImportAction('none', 'closed')).toBe('insert');
  });
});
