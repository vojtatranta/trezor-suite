import { mockAccountKey } from '@suite-common/wallet-types/mocks';

import { type TrackedEarnTransaction } from '../src/earn/earnTransactionsReducer';

export const mockTrackedEarnTransaction = (
    overrides: Partial<TrackedEarnTransaction> = {},
): TrackedEarnTransaction => ({
    accountKey: mockAccountKey(),
    txid: 'mockTxid',
    flow: 'stake',
    ...overrides,
});
