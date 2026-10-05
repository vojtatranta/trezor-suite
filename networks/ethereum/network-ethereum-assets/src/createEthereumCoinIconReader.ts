import { typedObjectEntries } from '@trezor/utils';

import type { EthereumAssetSymbol } from './ethereumAssets';

export type EthereumCoinIconReaderDeps = {
    readFile: (path: string) => Promise<Buffer>;
};

export type EthereumCoinIconReader = {
    isSupportedNetwork: (symbol: string) => boolean;
    readCoinIcon: (symbol: string) => Promise<Buffer | undefined>;
};

// Node tools read the same coin SVGs as the apps, without executing a bundler's asset loader.
export const createEthereumCoinIconReader = (
    deps: EthereumCoinIconReaderDeps,
): EthereumCoinIconReader => {
    const coinIconPaths: Record<EthereumAssetSymbol, string> = {
        arb: require.resolve('../assets/cryptoIcons/arb.svg'),
        avax: require.resolve('../assets/cryptoIcons/avax.svg'),
        base: require.resolve('../assets/cryptoIcons/base.svg'),
        bnb: require.resolve('../assets/cryptoIcons/bnb.svg'),
        bsc: require.resolve('../assets/cryptoIcons/bsc.svg'),
        etc: require.resolve('../assets/cryptoIcons/etc.svg'),
        eth: require.resolve('../assets/cryptoIcons/eth.svg'),
        hype: require.resolve('../assets/cryptoIcons/hype.svg'),
        op: require.resolve('../assets/cryptoIcons/op.svg'),
        pol: require.resolve('../assets/cryptoIcons/pol.svg'),
        rhc: require.resolve('../assets/cryptoIcons/rhc.svg'),
        teth: require.resolve('../assets/cryptoIcons/teth.svg'),
        thod: require.resolve('../assets/cryptoIcons/thod.svg'),
        tsep: require.resolve('../assets/cryptoIcons/tsep.svg'),
    };

    const paths = new Map<string, string>(typedObjectEntries(coinIconPaths));

    return {
        isSupportedNetwork: symbol => paths.has(symbol),
        readCoinIcon: symbol => {
            const path = paths.get(symbol);

            return path === undefined ? Promise.resolve(undefined) : deps.readFile(path);
        },
    };
};
