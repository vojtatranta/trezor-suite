import { memo } from 'react';

import { gotoThunk } from '@suite/router';
import { type WalletAssetKey } from '@suite-common/wallet-core';
import { useServices } from '@trezor/dependency-injection';
import { injectDispatch } from '@trezor/redux-utils';

import { useSelector } from '#src/hooks/suite';
import { AssetTableRowView } from '#src/views/home/HomeAssetsTable/AssetTableRowView';

import { accountAssetTable } from './selectedAccountAssetTable';

type AccountAssetRowContainerProps = {
    assetKey: WalletAssetKey;
};

/** A Home asset row with what one account holds of the asset. */
export const AccountAssetRowContainer = memo(function AccountAssetRowContainer({
    assetKey,
}: AccountAssetRowContainerProps) {
    const { dispatch } = useServices(injectDispatch);
    const networkSymbol = useSelector(state =>
        accountAssetTable.selectWalletAssetNetworkSymbol(state, assetKey),
    );
    const contractAddress = useSelector(state =>
        accountAssetTable.selectWalletAssetContractAddress(state, assetKey),
    );
    const tokenSymbol = useSelector(state =>
        accountAssetTable.selectWalletAssetTokenSymbol(state, assetKey),
    );
    const tokenDecimals = useSelector(state =>
        accountAssetTable.selectWalletAssetTokenDecimals(state, assetKey),
    );
    const amount = useSelector(state => accountAssetTable.selectWalletAssetAmount(state, assetKey));

    if (networkSymbol === undefined) {
        return null;
    }

    return (
        <AssetTableRowView
            networkSymbol={networkSymbol}
            contractAddress={contractAddress}
            tokenSymbol={tokenSymbol}
            tokenDecimals={tokenDecimals}
            amount={amount}
            onOpen={() =>
                dispatch(
                    gotoThunk({
                        routeName: 'suite-asset',
                        params: { symbol: networkSymbol, contractAddress },
                    }),
                )
            }
            data-testid={`@wallet/account-asset/${networkSymbol}/${contractAddress ?? 'coin'}`}
        />
    );
});
