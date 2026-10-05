import { asNetworkSymbol } from '@trezor/network-module-types';

import type { NetworkAssetsModule } from './NetworkAssetsModule';
import {
    type NetworkAssetsRegistryDeps,
    createNetworkAssetsRegistry,
} from './createNetworkAssetsRegistry';

const createAssets = (): NetworkAssetsModule<'btc' | 'btg'> => ({
    getSupportedNetworks: () => ['btc', 'btg'],
    getIcons: jest.fn(() => ({ coin: 42, network: 43, testnet: false })),
});

it('registers the complete asset catalog without loading SVGs', () => {
    const assets = createAssets();
    const deps: NetworkAssetsRegistryDeps = { networkAssetsModules: [assets] };
    const registry = createNetworkAssetsRegistry(deps);

    expect(assets.getIcons).not.toHaveBeenCalled();
    expect(registry.getSupportedNetworks()).toEqual(['btc', 'btg']);
    expect(registry.isSupportedNetwork('btg')).toBe(true);
    expect(registry.isSupportedNetwork('unknown')).toBe(false);
    expect(registry.getIcon(asNetworkSymbol('btg'))).toEqual({
        coin: 42,
        network: 43,
        testnet: false,
    });
    expect(assets.getIcons).toHaveBeenCalledWith('btg');
});

it('rejects unregistered symbols rather than returning an absent icon', () => {
    const deps: NetworkAssetsRegistryDeps = { networkAssetsModules: [createAssets()] };
    const registry = createNetworkAssetsRegistry(deps);

    expect(() => registry.getIcon(asNetworkSymbol('unknown'))).toThrow(
        'Missing network assets: unknown',
    );
});

it('rejects duplicate registrations without loading their icons', () => {
    const assets = createAssets();

    const deps: NetworkAssetsRegistryDeps = { networkAssetsModules: [assets, assets] };

    expect(() => createNetworkAssetsRegistry(deps)).toThrow('Duplicate network assets: btc');
    expect(assets.getIcons).not.toHaveBeenCalled();
});
