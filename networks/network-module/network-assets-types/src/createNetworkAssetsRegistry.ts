import { type NetworkSymbol, asNetworkSymbol } from '@trezor/network-module-types';

import type { NetworkAssetsModule, NetworkIcons } from './NetworkAssetsModule';

export type NetworkAssetsRegistryDeps = {
    networkAssetsModules: readonly NetworkAssetsModule[];
};

export type NetworkAssetsRegistry = {
    getSupportedNetworks(): readonly NetworkSymbol[];
    isSupportedNetwork(symbol: string): symbol is NetworkSymbol;
    getIcon(symbol: NetworkSymbol): NetworkIcons;
};

export type NetworkAssetsRegistryDep = { networkAssetsRegistry: NetworkAssetsRegistry };

export const createNetworkAssetsRegistry = (
    deps: NetworkAssetsRegistryDeps,
): NetworkAssetsRegistry => {
    const modules = new Map<NetworkSymbol, NetworkAssetsModule>();

    for (const module of deps.networkAssetsModules) {
        for (const symbol of module.getSupportedNetworks()) {
            const networkSymbol = asNetworkSymbol(symbol);
            if (modules.has(networkSymbol)) {
                throw new Error(`Duplicate network assets: ${symbol}.`);
            }
            modules.set(networkSymbol, module);
        }
    }

    return {
        getSupportedNetworks: () => Array.from(modules.keys()),
        isSupportedNetwork: (symbol): symbol is NetworkSymbol =>
            modules.has(asNetworkSymbol(symbol)),
        getIcon: symbol => {
            const module = modules.get(symbol);
            if (!module) {
                throw new Error(`Missing network assets: ${symbol}.`);
            }

            return module.getIcons(symbol);
        },
    };
};

export const injectNetworkAssetsRegistry = (
    services: NetworkAssetsRegistryDep,
): NetworkAssetsRegistryDep => ({
    networkAssetsRegistry: services.networkAssetsRegistry,
});
