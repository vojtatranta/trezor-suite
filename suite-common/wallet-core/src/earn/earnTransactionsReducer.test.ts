import { asNetworkSymbol } from '@suite-common/wallet-config';
import { asAccountDescriptor } from '@suite-common/wallet-types';
import { mockWalletAccount } from '@suite-common/wallet-types/mocks';

import {
    type EarnTransactionsState,
    earnTransactionsActions,
    earnTransactionsReducer,
    selectTrackedEarnTransaction,
} from './earnTransactionsReducer';
import { mockTrackedEarnTransaction } from '../../mocks';
import { accountsActions } from '../accounts/accountsActions';

const account = mockWalletAccount({
    symbol: asNetworkSymbol('eth'),
    deviceState: '1@2:3',
    descriptor: asAccountDescriptor('accA'),
});
const otherAccount = mockWalletAccount({
    symbol: asNetworkSymbol('eth'),
    deviceState: '1@2:3',
    descriptor: asAccountDescriptor('accB'),
});

const stakeTx1 = mockTrackedEarnTransaction({
    accountKey: account.key,
    txid: 'tx1',
    flow: 'stake',
});
const claimTx2 = mockTrackedEarnTransaction({
    accountKey: account.key,
    txid: 'tx2',
    flow: 'claim',
});
const otherAccountTx1 = mockTrackedEarnTransaction({
    accountKey: otherAccount.key,
    txid: 'tx1',
    flow: 'unstake',
});

const toRootState = (earnTransactions: EarnTransactionsState) => ({
    wallet: { earnTransactions },
});

describe('earnTransactionsReducer', () => {
    it('tracks a broadcast earn transaction under its account', () => {
        const state = earnTransactionsReducer(
            [],
            earnTransactionsActions.trackEarnTransaction(stakeTx1),
        );

        expect(selectTrackedEarnTransaction(toRootState(state), account.key, 'tx1')).toEqual(
            stakeTx1,
        );
        expect(
            selectTrackedEarnTransaction(toRootState(state), account.key, 'tx2'),
        ).toBeUndefined();
        expect(
            selectTrackedEarnTransaction(toRootState(state), otherAccount.key, 'tx1'),
        ).toBeUndefined();
    });

    it('replaces the record when the same transaction is tracked again', () => {
        const state = earnTransactionsReducer(
            [stakeTx1],
            earnTransactionsActions.trackEarnTransaction({ ...stakeTx1, flow: 'claim' }),
        );

        expect(state).toEqual([{ ...stakeTx1, flow: 'claim' }]);
    });

    it('keeps other tracked transactions when one is untracked', () => {
        const state = earnTransactionsReducer(
            [stakeTx1, claimTx2, otherAccountTx1],
            earnTransactionsActions.untrackEarnTransaction({
                accountKey: account.key,
                txid: 'tx1',
            }),
        );

        expect(state).toEqual([claimTx2, otherAccountTx1]);
    });

    it('ignores untracking of an unknown transaction', () => {
        const state = earnTransactionsReducer(
            [stakeTx1],
            earnTransactionsActions.untrackEarnTransaction({
                accountKey: account.key,
                txid: 'nope',
            }),
        );

        expect(state).toEqual([stakeTx1]);
    });

    it('forgets the transactions of a removed account only', () => {
        const state = earnTransactionsReducer(
            [stakeTx1, claimTx2, otherAccountTx1],
            accountsActions.removeAccount([account]),
        );

        expect(state).toEqual([otherAccountTx1]);
    });
});
