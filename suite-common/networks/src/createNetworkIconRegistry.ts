import type {
    NetworkAssetsRegistryDep,
    NetworkIconRegistry,
    NetworkIconRegistryDep,
    NetworkIconData,
    TokenIconData,
} from '@trezor/network-assets-types';

import type { NetworkModuleRepositoryDep } from './NetworkModuleRepository';

export type NetworkIconRegistryDeps = NetworkModuleRepositoryDep & NetworkAssetsRegistryDep;

export const createNetworkIconRegistry = (deps: NetworkIconRegistryDeps): NetworkIconRegistry => {
    const networks = new Map<string, NetworkIconData>();
    for (const symbol of deps.networkModuleRepository.getSupportedNetworks()) {
        const module = deps.networkModuleRepository.get(symbol);
        const config = module.getNetworkConfig(symbol);
        const icons = deps.networkAssetsRegistry.getIcon(symbol);
        const nativeSymbol = config.settlementLayer ?? symbol;
        const nativeIcons = deps.networkAssetsRegistry.isSupportedNetwork(nativeSymbol)
            ? deps.networkAssetsRegistry.getIcon(nativeSymbol)
            : undefined;
        networks.set(symbol, {
            symbol,
            name: config.name,
            displaySymbol: config.displaySymbol,
            color: config.color,
            src: icons.coin,
            nativeSrc: nativeIcons?.coin ?? icons.coin,
            badge: { src: icons.network, testnet: config.testnet },
            supportsTokens: config.features.includes('tokens'),
        });
    }

    return {
        getIcon: deps.networkAssetsRegistry.getIcon,
        getNetworkIcon: symbol => networks.get(symbol),
        getTokenIcon: ({ symbol, contractAddress, showNetworkIcon, wrappedTokenIcon }) => {
            if (!deps.networkModuleRepository.isSupportedNetwork(symbol)) return undefined;
            const module = deps.networkModuleRepository.get(symbol);
            const network = networks.get(symbol);
            if (!network) return undefined;
            const config = module.getNetworkConfig(symbol);
            const useNativeIcon =
                wrappedTokenIcon === 'network' &&
                !!contractAddress &&
                !!module.icon.isWrappedNativeToken?.(symbol, contractAddress);
            if (!contractAddress || useNativeIcon) {
                return {
                    src: showNetworkIcon ? network.nativeSrc : network.src,
                    ...(showNetworkIcon &&
                    (config.settlementLayer || wrappedTokenIcon === 'network')
                        ? { badge: network.badge }
                        : {}),
                };
            }
            const { coingeckoId } = config;
            if (!coingeckoId) return { src: network.src };

            const resolve = (addresses: readonly string[]): TokenIconData => {
                const native =
                    addresses.length === 0 ||
                    addresses.includes('0x0000000000000000000000000000000000000000');
                const nativeSymbol = config.displaySymbol.toLowerCase();
                const nativeConfig = deps.networkModuleRepository.isSupportedNetwork(nativeSymbol)
                    ? deps.networkModuleRepository.get(nativeSymbol).getNetworkConfig(nativeSymbol)
                    : undefined;

                return {
                    coingeckoId: native
                        ? (nativeConfig?.tradeCryptoId ?? coingeckoId)
                        : coingeckoId,
                    contractAddresses: addresses,
                    ...(showNetworkIcon ? { badge: network.badge } : {}),
                };
            };
            const addresses = module.icon.getTokenLogoIdentifiers(symbol, contractAddress);

            return addresses instanceof Promise ? addresses.then(resolve) : resolve(addresses);
        },
    };
};

export const injectNetworkIconRegistry = (
    services: NetworkIconRegistryDep,
): NetworkIconRegistryDep => ({
    networkIconRegistry: services.networkIconRegistry,
});
