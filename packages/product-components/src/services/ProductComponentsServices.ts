import type { NetworkIconData, NetworkIconRegistry } from '@trezor/network-assets-types';

export type ProductComponentsServices = {
    getIcon: NetworkIconRegistry['getIcon'];
    getTokenIcon: NetworkIconRegistry['getTokenIcon'];
    getNetworkIcon: (
        symbol: string,
    ) => Pick<NetworkIconData, 'nativeSrc' | 'supportsTokens'> | undefined;
};
