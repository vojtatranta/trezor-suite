import type { NetworkAssetsModule, NetworkIcons } from '@trezor/network-assets-types';
import type { TezosNetworkSymbol } from '@trezor/network-tezos-types';
import { typedObjectKeys } from '@trezor/utils';

// Keep SVG loading lazy so registering assets does not load their files.
const icons: Record<TezosNetworkSymbol, () => NetworkIcons> = {
    xtz: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/xtz.svg'),
        network: require('../assets/networkIcons/xtz.svg'),
    }),
};

export const tezosAssets: NetworkAssetsModule<TezosNetworkSymbol> = {
    getSupportedNetworks: () => typedObjectKeys(icons),
    getIcons: symbol => icons[symbol](),
};
