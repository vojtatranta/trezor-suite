import {
    type NetworkConfigState,
    type NetworkConfigStore,
    asNetworkSymbol,
} from '@trezor/network-module-types';

import type { ProductComponentsServices } from '../../services/ProductComponentsServices';

export const exampleIcon =
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"%3E%3Ccircle cx="16" cy="16" r="16" fill="%236277bf"/%3E%3Cpath d="M16 5l7 11-7 11-7-11z" fill="white"/%3E%3C/svg%3E';

export const storyServices: ProductComponentsServices = {
    getIcon: symbol => ({
        coin: exampleIcon,
        network: exampleIcon,
        testnet: symbol.startsWith('t'),
    }),
    getNetworkIcon: () => ({ nativeSrc: exampleIcon, supportsTokens: true }),
    getTokenIcon: ({ contractAddress, showNetworkIcon }) => ({
        ...(contractAddress
            ? { coingeckoId: 'ethereum', contractAddresses: [contractAddress] }
            : { src: exampleIcon }),
        ...(showNetworkIcon ? { badge: { src: exampleIcon, testnet: false } } : {}),
    }),
};

const state: NetworkConfigState = {
    networks: {
        [asNetworkSymbol('btc')]: { name: 'Bitcoin' },
        [asNetworkSymbol('eth')]: { name: 'Ethereum' },
        [asNetworkSymbol('ltc')]: { name: 'Litecoin' },
        [asNetworkSymbol('ada')]: { name: 'Cardano' },
    },
};
export const storyNetworkConfigStore: NetworkConfigStore = {
    getState: () => state,
    subscribe: () => () => {},
};
