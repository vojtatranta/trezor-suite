import {
    type NetworkAssetsRegistry,
    createNetworkAssetsRegistry,
} from '@trezor/network-assets-types';
import type { NetworkSymbol } from '@trezor/network-module-types';

import type { StaticNetworkModulesDep } from './NetworkModules';

export const createNetworkAssetsCompositionRoot = (
    deps: StaticNetworkModulesDep,
): NetworkAssetsRegistry =>
    createNetworkAssetsRegistry({
        networkAssetsModules: deps.networkModules.map(module => ({
            getSupportedNetworks: module.getSupportedNetworks,
            getIcons: (symbol: NetworkSymbol) => module.icon.getIcons(symbol),
        })),
    });
