import type { NetworkAssetsModule, NetworkIcons } from '@trezor/network-assets-types';
import type { CardanoNetworkSymbol } from '@trezor/network-cardano-types';
import { typedObjectKeys } from '@trezor/utils';

export type CardanoAssetSymbol = CardanoNetworkSymbol | 'tada';

// Keep SVG loading lazy so registering assets does not load their files.
const icons: Record<CardanoAssetSymbol, () => NetworkIcons> = {
    ada: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/ada.svg'),
        network: require('../assets/networkIcons/ada.svg'),
    }),
    tada: () => ({
        testnet: true,
        coin: require('../assets/cryptoIcons/tada.svg'),
        network: require('../assets/networkIcons/ada.svg'),
    }),
};

export const cardanoAssets: NetworkAssetsModule<CardanoAssetSymbol> = {
    getSupportedNetworks: () => typedObjectKeys(icons),
    getIcons: symbol => icons[symbol](),
};
