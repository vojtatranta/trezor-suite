import { asNetworkSymbol } from '@trezor/network-module-types';

import { createNetworkModuleRepository } from './NetworkModuleRepository';
import type { StaticNetworkModulesDep } from './NetworkModules';
import { createNetworkAssetsCompositionRoot } from './createNetworkAssetsCompositionRoot';
import { mockNetworkModule } from '../mocks/mockNetworkModule';

it('uses injected module icons for supported wallet networks', () => {
    const getIcons = jest.fn(() => ({ coin: 'custom.svg', network: 42, testnet: false }));
    const networkModules = [
        mockNetworkModule({
            getSupportedNetworks: () => [asNetworkSymbol('btc')],
            icon: { getIcons, getTokenLogoIdentifiers: (_symbol, contract) => [contract] },
        }),
    ];
    const deps: StaticNetworkModulesDep = { networkModules };
    const registry = createNetworkAssetsCompositionRoot(deps);
    const repository = createNetworkModuleRepository(deps);

    expect(getIcons).not.toHaveBeenCalled();
    expect(registry.isSupportedNetwork('btg')).toBe(false);
    expect(repository.isSupportedNetwork('btg')).toBe(false);
    expect(registry.getIcon(asNetworkSymbol('btc'))).toEqual({
        coin: 'custom.svg',
        network: 42,
        testnet: false,
    });
    expect(getIcons).toHaveBeenCalledWith(asNetworkSymbol('btc'));
    expect(() => registry.getIcon(asNetworkSymbol('ada'))).toThrow('Missing network assets: ada');
});
