import type { NetworkAssetsModule } from '@trezor/network-assets-types';
import type { NetworkIcon } from '@trezor/network-module-suite-common-types';
import type { TronNetworkSymbol } from '@trezor/network-tron-types';

export type TronIconDeps = {
    tronAssets: NetworkAssetsModule<TronNetworkSymbol>;
};

export const createTronIcon = (deps: TronIconDeps): NetworkIcon<TronNetworkSymbol> => ({
    getIcons: symbol => deps.tronAssets.getIcons(symbol),
    getTokenLogoIdentifiers: (_symbol, contract) => [contract],
});
