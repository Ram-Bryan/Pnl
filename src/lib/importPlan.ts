export type ExistingTradeState = 'none' | 'open' | 'closed';

export type ImportAction = 'insert' | 'upgrade' | 'skip';

export function planImportAction(existing: ExistingTradeState, rowKind: 'open' | 'closed'): ImportAction {
  if (rowKind === 'open') {
    // Re-importing the same open-positions file must not duplicate positions.
    return existing === 'none' ? 'insert' : 'skip';
  }
  switch (existing) {
    case 'open':
      return 'upgrade';
    case 'closed':
      return 'skip';
    case 'none':
      return 'insert';
  }
}
