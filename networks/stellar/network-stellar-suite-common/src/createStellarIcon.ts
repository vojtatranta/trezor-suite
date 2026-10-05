import type { NetworkAssetsModule } from '@trezor/network-assets-types';
import type { NetworkIcon } from '@trezor/network-module-suite-common-types';
import type { StellarNetworkSymbol } from '@trezor/network-stellar-types';

export type StellarIconDeps = {
    stellarAssets: NetworkAssetsModule<StellarNetworkSymbol>;
    getStellarTokenLogoAddresses: (
        contract: string,
    ) => readonly string[] | Promise<readonly string[]>;
};

export const createStellarIcon = (deps: StellarIconDeps): NetworkIcon<StellarNetworkSymbol> => ({
    getIcons: symbol => deps.stellarAssets.getIcons(symbol),
    getTokenLogoIdentifiers: (symbol, contract) =>
        symbol === 'xlm' ? deps.getStellarTokenLogoAddresses(contract) : [contract],
});
