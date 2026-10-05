import type { NetworkAssetsModule } from '@trezor/network-assets-types';
import type { NetworkIcon } from '@trezor/network-module-suite-common-types';
import type { SolanaNetworkSymbol } from '@trezor/network-solana-types';

export type SolanaIconDeps = {
    solanaAssets: NetworkAssetsModule<SolanaNetworkSymbol>;
};

export const createSolanaIcon = (deps: SolanaIconDeps): NetworkIcon<SolanaNetworkSymbol> => ({
    getIcons: symbol => deps.solanaAssets.getIcons(symbol),
    getTokenLogoIdentifiers: (_symbol, contract) => [contract],
});
