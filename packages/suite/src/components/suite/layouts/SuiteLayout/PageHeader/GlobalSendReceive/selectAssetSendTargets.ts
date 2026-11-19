import {
    type AssetAccountsRootState,
    selectDeviceAssetAccountsOfAsset,
} from '@suite-common/assets';
import { selectVisibleDeviceAccountsMap } from '@suite-common/wallet-core';
import { isPositiveBalance } from '@suite-common/wallet-utils';
import { createWeakMapSelector, returnStableArrayIfEmpty } from '@trezor/redux-utils';

import { type GlobalSendTarget } from './types';

const createMemoizedSelector = createWeakMapSelector.withTypes<AssetAccountsRootState>();

export const selectAssetSendTargets = createMemoizedSelector(
    [selectDeviceAssetAccountsOfAsset, selectVisibleDeviceAccountsMap],
    (assetAccounts, accountsByKey): GlobalSendTarget[] =>
        returnStableArrayIfEmpty(
            assetAccounts.flatMap((assetAccount): GlobalSendTarget[] => {
                const account = accountsByKey.get(assetAccount.accountKey);

                if (account === undefined) {
                    return [];
                }

                const { contractAddress } = assetAccount;

                if (contractAddress === undefined && !isPositiveBalance(account.balance)) {
                    return [];
                }

                return [{ account, contractAddress }];
            }),
        ),
);
