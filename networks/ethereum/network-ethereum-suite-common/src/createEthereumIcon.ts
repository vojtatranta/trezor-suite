import type { NetworkAssetsModule } from '@trezor/network-assets-types';
import type { EthereumAssetSymbol } from '@trezor/network-ethereum-assets';
import type { EthereumNetworkSymbol } from '@trezor/network-ethereum-types';
import type { NetworkIcon } from '@trezor/network-module-suite-common-types';

export type EthereumIconDeps = {
    ethereumAssets: NetworkAssetsModule<EthereumAssetSymbol>;
    isWrappedNativeToken: NonNullable<NetworkIcon<EthereumNetworkSymbol>['isWrappedNativeToken']>;
};

export const createEthereumIcon = (deps: EthereumIconDeps): NetworkIcon<EthereumNetworkSymbol> => ({
    getIcons: symbol => deps.ethereumAssets.getIcons(symbol),
    isWrappedNativeToken: deps.isWrappedNativeToken,
    getTokenLogoIdentifiers: (_symbol, contract) => [contract.toLowerCase()],
});
