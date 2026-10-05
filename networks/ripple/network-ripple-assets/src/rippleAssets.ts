import type { NetworkAssetsModule, NetworkIcons } from '@trezor/network-assets-types';
import type { RippleNetworkSymbol } from '@trezor/network-ripple-types';
import { typedObjectKeys } from '@trezor/utils';

// Keep SVG loading lazy so registering assets does not load their files.
const icons: Record<RippleNetworkSymbol, () => NetworkIcons> = {
    txrp: () => ({
        testnet: true,
        coin: require('../assets/cryptoIcons/txrp.svg'),
        network: require('../assets/networkIcons/xrp.svg'),
    }),
    xrp: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/xrp.svg'),
        network: require('../assets/networkIcons/xrp.svg'),
    }),
};

export const rippleAssets: NetworkAssetsModule<RippleNetworkSymbol> = {
    getSupportedNetworks: () => typedObjectKeys(icons),
    getIcons: symbol => icons[symbol](),
};
