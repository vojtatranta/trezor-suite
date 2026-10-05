import type { NetworkAssetsModule, NetworkIcons } from '@trezor/network-assets-types';
import type { EthereumNetworkSymbol } from '@trezor/network-ethereum-types';
import { typedObjectKeys } from '@trezor/utils';

export type EthereumAssetSymbol = EthereumNetworkSymbol | 'bnb' | 'teth';

// Keep SVG loading lazy so registering assets does not load their files.
const icons: Record<EthereumAssetSymbol, () => NetworkIcons> = {
    arb: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/arb.svg'),
        network: require('../assets/networkIcons/arb.svg'),
    }),
    avax: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/avax.svg'),
        network: require('../assets/networkIcons/avax.svg'),
    }),
    base: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/base.svg'),
        network: require('../assets/networkIcons/base.svg'),
    }),
    bnb: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/bnb.svg'),
        network: require('../assets/networkIcons/bsc.svg'),
    }),
    bsc: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/bsc.svg'),
        network: require('../assets/networkIcons/bsc.svg'),
    }),
    etc: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/etc.svg'),
        network: require('../assets/networkIcons/etc.svg'),
    }),
    eth: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/eth.svg'),
        network: require('../assets/networkIcons/eth.svg'),
    }),
    hype: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/hype.svg'),
        network: require('../assets/networkIcons/hype.svg'),
    }),
    op: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/op.svg'),
        network: require('../assets/networkIcons/op.svg'),
    }),
    pol: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/pol.svg'),
        network: require('../assets/networkIcons/pol.svg'),
    }),
    rhc: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/rhc.svg'),
        network: require('../assets/networkIcons/rhc.svg'),
    }),
    teth: () => ({
        testnet: true,
        coin: require('../assets/cryptoIcons/teth.svg'),
        network: require('../assets/networkIcons/eth.svg'),
    }),
    thod: () => ({
        testnet: true,
        coin: require('../assets/cryptoIcons/thod.svg'),
        network: require('../assets/networkIcons/eth.svg'),
    }),
    tsep: () => ({
        testnet: true,
        coin: require('../assets/cryptoIcons/tsep.svg'),
        network: require('../assets/networkIcons/eth.svg'),
    }),
};

export const ethereumAssets: NetworkAssetsModule<EthereumAssetSymbol> = {
    getSupportedNetworks: () => typedObjectKeys(icons),
    getIcons: symbol => icons[symbol](),
};
