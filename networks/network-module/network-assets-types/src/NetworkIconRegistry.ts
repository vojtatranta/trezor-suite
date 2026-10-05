import type { NetworkSymbol } from '@trezor/network-module-types';

import type { NetworkIcons, NetworkIconSource } from './NetworkAssetsModule';

export type NetworkBadgeData = { src: NetworkIconSource; testnet: boolean };

export type NetworkIconData = {
    symbol: string;
    name: string;
    displaySymbol: string;
    color: `#${string}`;
    src: NetworkIconSource;
    nativeSrc: NetworkIconSource;
    badge: NetworkBadgeData;
    supportsTokens: boolean;
};

export type TokenIconData = {
    src?: NetworkIconSource;
    coingeckoId?: string;
    contractAddresses?: readonly string[];
    badge?: NetworkBadgeData;
};

export type GetTokenIconParams = {
    symbol: string;
    contractAddress?: string | null;
    showNetworkIcon?: boolean;
    wrappedTokenIcon?: 'token' | 'network';
};

export type NetworkIconRegistry = {
    getIcon(symbol: NetworkSymbol): NetworkIcons;
    getNetworkIcon(symbol: string): NetworkIconData | undefined;
    getTokenIcon(params: GetTokenIconParams): TokenIconData | Promise<TokenIconData> | undefined;
};

export type NetworkIconRegistryDep = { networkIconRegistry: NetworkIconRegistry };
