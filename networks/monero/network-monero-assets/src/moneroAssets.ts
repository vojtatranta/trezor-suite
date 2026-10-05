import type { NetworkAssetsModule, NetworkIcons } from '@trezor/network-assets-types';
import type { MoneroNetworkSymbol } from '@trezor/network-monero-types';
import { typedObjectKeys } from '@trezor/utils';

// Keep SVG loading lazy so registering assets does not load their files.
const icons: Record<MoneroNetworkSymbol, () => NetworkIcons> = {
    xmr: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/xmr.svg'),
        network: require('../assets/networkIcons/xmr.svg'),
    }),
};

export const moneroAssets: NetworkAssetsModule<MoneroNetworkSymbol> = {
    getSupportedNetworks: () => typedObjectKeys(icons),
    getIcons: symbol => icons[symbol](),
};
