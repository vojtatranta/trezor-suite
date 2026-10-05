import { type PayloadAction, createSlice } from '@reduxjs/toolkit';

import { type AccountKey } from '@suite-common/wallet-types';

import { accountsActions } from '../accounts/accountsActions';

export type EarnTransactionFlow =
    | 'stake'
    | 'unstake'
    | 'claim'
    | 'withdraw'
    | 'vote'
    | 'yield-deposit'
    | 'yield-withdraw'
    | 'yield-claim';

export type TrackedEarnTransaction = {
    accountKey: AccountKey;
    txid: string;
    flow: EarnTransactionFlow;
};

export type EarnTransactionsState = TrackedEarnTransaction[];

export type EarnTransactionsRootState = {
    wallet: {
        earnTransactions: EarnTransactionsState;
    };
};

export const EARN_TRANSACTION_TOAST_TYPE = {
    stake: 'tx-staked',
    unstake: 'tx-unstaked',
    claim: 'tx-claimed',
    withdraw: 'tx-withdrawn',
    vote: 'tx-voted',
    'yield-deposit': 'tx-yield-deposit',
    'yield-withdraw': 'tx-yield-withdraw',
    'yield-claim': 'tx-yield-claim',
} as const satisfies Record<EarnTransactionFlow, string>;

export type EarnTransactionToastType = (typeof EARN_TRANSACTION_TOAST_TYPE)[EarnTransactionFlow];

export const earnTransactionsInitialState: EarnTransactionsState = [];

type UntrackEarnTransactionPayload = {
    accountKey: AccountKey;
    txid: string;
};

const isTransaction =
    ({ accountKey, txid }: UntrackEarnTransactionPayload) =>
    (tracked: TrackedEarnTransaction) =>
        tracked.accountKey === accountKey && tracked.txid === txid;

const earnTransactionsSlice = createSlice({
    name: 'earnTransactions',
    initialState: earnTransactionsInitialState,
    reducers: {
        trackEarnTransaction: (state, action: PayloadAction<TrackedEarnTransaction>) => {
            const index = state.findIndex(isTransaction(action.payload));

            if (index === -1) {
                state.push(action.payload);
            } else {
                state[index] = action.payload;
            }
        },
        untrackEarnTransaction: (state, action: PayloadAction<UntrackEarnTransactionPayload>) => {
            const index = state.findIndex(isTransaction(action.payload));

            if (index !== -1) {
                state.splice(index, 1);
            }
        },
    },
    extraReducers: builder => {
        builder.addCase(accountsActions.removeAccount, (state, action) => {
            const removedAccountKeys = new Set(action.payload.map(account => account.key));

            return state.filter(tracked => !removedAccountKeys.has(tracked.accountKey));
        });
    },
});

export const earnTransactionsActions = earnTransactionsSlice.actions;
export const earnTransactionsReducer = earnTransactionsSlice.reducer;

export const selectTrackedEarnTransaction = (
    state: EarnTransactionsRootState,
    accountKey: AccountKey,
    txid: string,
): TrackedEarnTransaction | undefined =>
    state.wallet.earnTransactions.find(isTransaction({ accountKey, txid }));
