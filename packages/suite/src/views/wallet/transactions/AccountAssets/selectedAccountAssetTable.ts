import { type SelectedAccountRootState, selectSelectedAccountKey } from '@suite/account';
import { type HomeAssetTableState, createAssetTableSelectors } from '@suite-common/assets';
import { getWalletAssetKey, selectAccountByKey } from '@suite-common/wallet-core';
import { type Account } from '@suite-common/wallet-types';
import { createWeakMapSelector, returnStableArrayIfEmpty } from '@trezor/redux-utils';

type AccountAssetTableState = HomeAssetTableState & SelectedAccountRootState;

const createMemoizedSelector = createWeakMapSelector.withTypes<AccountAssetTableState>();

const selectSelectedAccountAlone = createMemoizedSelector(
    [(state: AccountAssetTableState) => selectAccountByKey(state, selectSelectedAccountKey(state))],
    (account): readonly Account[] => returnStableArrayIfEmpty(account === null ? [] : [account]),
);

export const accountAssetTable = createAssetTableSelectors({
    name: 'selectedAccount',
    selectAccounts: selectSelectedAccountAlone,
    isKeptToAllowedNetworks: false,
});

export const selectSelectedAccountCoinAssetKey = createMemoizedSelector(
    [selectSelectedAccountAlone],
    ([account]) =>
        account === undefined
            ? undefined
            : getWalletAssetKey({
                  deviceState: account.deviceState,
                  networkSymbol: account.symbol,
                  contractAddress: undefined,
              }),
);
