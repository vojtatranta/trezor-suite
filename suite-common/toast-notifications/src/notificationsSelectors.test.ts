import { asNetworkSymbol } from '@suite-common/wallet-config';

import { selectIsTransactionConfirmationNotified } from './notificationsSelectors';
import { type NotificationEntry } from './types';

const transaction = {
    descriptor: 'descriptor',
    symbol: asNetworkSymbol('eth'),
    txid: 'tx1',
};

const toRootState = (notifications: NotificationEntry[]) => ({ notifications });

describe('selectIsTransactionConfirmationNotified', () => {
    it('is true once a generic confirmed event exists for the txid', () => {
        const state = toRootState([
            { context: 'event', id: 1, type: 'tx-confirmed', amount: '1', ...transaction },
        ]);

        expect(selectIsTransactionConfirmationNotified(state, 'tx1')).toBe(true);
        expect(selectIsTransactionConfirmationNotified(state, 'tx2')).toBe(false);
    });

    it('is true once an earn confirmed toast exists for the txid', () => {
        const state = toRootState([
            { context: 'toast', id: 1, type: 'tx-staked', stage: 'confirmed', ...transaction },
        ]);

        expect(selectIsTransactionConfirmationNotified(state, 'tx1')).toBe(true);
    });

    it('ignores pending toasts of the same transaction', () => {
        const state = toRootState([
            { context: 'toast', id: 1, type: 'tx-staked', stage: 'pending', ...transaction },
            { context: 'toast', id: 2, type: 'tx-sent', amount: '1', ...transaction },
        ]);

        expect(selectIsTransactionConfirmationNotified(state, 'tx1')).toBe(false);
    });
});
