import type { NetworkAssetsModule } from '@trezor/network-assets-types';
import type { NetworkIcon } from '@trezor/network-module-suite-common-types';
import type { RippleNetworkSymbol } from '@trezor/network-ripple-types';

export type RippleIconDeps = {
    rippleAssets: NetworkAssetsModule<RippleNetworkSymbol>;
};

export const createRippleIcon = (deps: RippleIconDeps): NetworkIcon<RippleNetworkSymbol> => ({
    getIcons: symbol => deps.rippleAssets.getIcons(symbol),
    getTokenLogoIdentifiers: (_symbol, contract) => [contract],
});
