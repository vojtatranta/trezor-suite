import type { NetworkAssetsModule, NetworkIcons } from '@trezor/network-assets-types';
import type { BitcoinNetworkSymbol } from '@trezor/network-bitcoin-types';
import { typedObjectKeys } from '@trezor/utils';

export type BitcoinAssetSymbol = BitcoinNetworkSymbol | 'btg' | 'dash' | 'dgb' | 'nmc' | 'vtc';

// Keep SVG loading lazy so registering assets does not load their files.
const icons: Record<BitcoinAssetSymbol, () => NetworkIcons> = {
    bch: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/bch.svg'),
        network: require('../assets/networkIcons/bch.svg'),
    }),
    btc: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/btc.svg'),
        network: require('../assets/networkIcons/btc.svg'),
    }),
    btg: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/btg.svg'),
        network: require('../assets/networkIcons/btg.svg'),
    }),
    dash: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/dash.svg'),
        network: require('../assets/networkIcons/dash.svg'),
    }),
    dgb: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/dgb.svg'),
        network: require('../assets/networkIcons/dgb.svg'),
    }),
    doge: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/doge.svg'),
        network: require('../assets/networkIcons/doge.svg'),
    }),
    ltc: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/ltc.svg'),
        network: require('../assets/networkIcons/ltc.svg'),
    }),
    nmc: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/nmc.svg'),
        network: require('../assets/networkIcons/nmc.svg'),
    }),
    regtest: () => ({
        testnet: true,
        coin: require('../assets/cryptoIcons/regtest.svg'),
        network: require('../assets/networkIcons/btc.svg'),
    }),
    test: () => ({
        testnet: true,
        coin: require('../assets/cryptoIcons/test.svg'),
        network: require('../assets/networkIcons/btc.svg'),
    }),
    vtc: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/vtc.svg'),
        network: require('../assets/networkIcons/vtc.svg'),
    }),
    zec: () => ({
        testnet: false,
        coin: require('../assets/cryptoIcons/zec.svg'),
        network: require('../assets/networkIcons/zec.svg'),
    }),
};

export const bitcoinAssets: NetworkAssetsModule<BitcoinAssetSymbol> = {
    getSupportedNetworks: () => typedObjectKeys(icons),
    getIcons: symbol => icons[symbol](),
};
