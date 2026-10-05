import { useServices } from '@suite-common/dependency-injection';
import { injectNetworkAssetsRegistry } from '@trezor/network-assets-types';

export const useNetworkAssets = (symbol: string) => {
    const { networkAssetsRegistry } = useServices(injectNetworkAssetsRegistry);

    const networkSymbol = symbol.toLowerCase();

    return networkAssetsRegistry.isSupportedNetwork(networkSymbol)
        ? networkAssetsRegistry.getIcon(networkSymbol)
        : undefined;
};
