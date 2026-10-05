import type { NetworkAssetsModule } from '@trezor/network-assets-types';
import type { BitcoinAssetSymbol } from '@trezor/network-bitcoin-assets';
import type { BitcoinNetworkSymbol } from '@trezor/network-bitcoin-types';
import type { NetworkIcon } from '@trezor/network-module-suite-common-types';

export type BitcoinIconDeps = {
    bitcoinAssets: NetworkAssetsModule<BitcoinAssetSymbol>;
};

export const createBitcoinIcon = (deps: BitcoinIconDeps): NetworkIcon<BitcoinNetworkSymbol> => ({
    getIcons: symbol => deps.bitcoinAssets.getIcons(symbol),
    getTokenLogoIdentifiers: (_symbol, contract) => [contract],
});
