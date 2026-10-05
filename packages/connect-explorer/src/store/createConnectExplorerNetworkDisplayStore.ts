import type { NetworkAssetsModule, NetworkIcons } from '@trezor/network-assets-types';
import {
    type NetworkConfigState,
    type NetworkConfigStore,
    type NetworkSymbol,
    asNetworkSymbol,
} from '@trezor/network-module-types';
import type { ProductComponentsServices } from '@trezor/product-components';
import { typedObjectFromEntries } from '@trezor/utils';

import type { ExplorerNetworkConfig } from '../config/networks';

export type ConnectExplorerNetworkDisplayStoreDeps = {
    networkConfig: readonly ExplorerNetworkConfig[];
};

export type ConnectExplorerNetworkDisplayStore = NetworkConfigStore & ProductComponentsServices;

export const createConnectExplorerNetworkDisplayStore = (
    deps: ConnectExplorerNetworkDisplayStoreDeps,
): ConnectExplorerNetworkDisplayStore => {
    const networkAssetsBySymbol = new Map<string, NetworkAssetsModule>();

    deps.networkConfig.forEach(network => {
        network.icons.getSupportedNetworks().forEach(symbol => {
            networkAssetsBySymbol.set(symbol, network.icons);
        });
    });

    const state: NetworkConfigState = {
        networks: typedObjectFromEntries(
            deps.networkConfig.map(network => [network.symbol, { name: network.name }]),
        ),
    };

    const getIcon = (symbol: NetworkSymbol): NetworkIcons => {
        const assets = networkAssetsBySymbol.get(symbol);
        if (!assets) {
            throw new Error(`Missing Explorer network config: ${symbol}.`);
        }

        return assets.getIcons(symbol);
    };

    return {
        getState: () => state,
        subscribe: () => () => {},
        getIcon,
        getTokenIcon: ({ symbol, contractAddress }) =>
            contractAddress ? undefined : { src: getIcon(asNetworkSymbol(symbol)).coin },
        getNetworkIcon: symbol =>
            networkAssetsBySymbol.has(symbol)
                ? { nativeSrc: getIcon(asNetworkSymbol(symbol)).coin, supportsTokens: false }
                : undefined,
    };
};
