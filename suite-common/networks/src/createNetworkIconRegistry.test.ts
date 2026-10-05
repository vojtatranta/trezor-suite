import { createMockDeps, mock } from '@suite-common/dependency-injection';

import { createNetworkModuleRepository } from './NetworkModuleRepository';
import { type NetworkSymbol, asNetworkSymbol } from './NetworkModules';
import { createNetworkAssetsCompositionRoot } from './createNetworkAssetsCompositionRoot';
import {
    type NetworkIconRegistryDeps,
    createNetworkIconRegistry,
} from './createNetworkIconRegistry';
import { createNetworkModulesCompositionRoot } from './createNetworkModulesCompositionRoot';

const createRegistryDeps = () => {
    const networkModules = createNetworkModulesCompositionRoot({ getTrezorConnect: mock() });
    const repository = createNetworkModuleRepository({ networkModules });
    const ethereumModule = repository.get(asNetworkSymbol('eth'));
    ethereumModule.icon = {
        getIcons: symbol => ({
            testnet: false,
            coin: `${symbol}.svg`,
            network: `${symbol}-badge.svg`,
        }),
        getTokenLogoIdentifiers: (_symbol, contract) => [contract.toLowerCase()],
        isWrappedNativeToken: (_symbol, contract) => contract === 'wrapped',
    };
    const deps = createMockDeps<NetworkIconRegistryDeps>({
        networkAssetsRegistry: {
            getIcon: symbol => ({
                testnet: false,
                coin: `${symbol}.svg`,
                network: `${symbol}-badge.svg`,
            }),
            isSupportedNetwork: (symbol): symbol is NetworkSymbol =>
                symbol === 'eth' || symbol === 'op',
            getSupportedNetworks: () => [asNetworkSymbol('eth'), asNetworkSymbol('op')],
        },
        networkModuleRepository: {
            getSupportedNetworks: () => [asNetworkSymbol('eth'), asNetworkSymbol('op')],
            isSupportedNetwork: (symbol): symbol is NetworkSymbol =>
                symbol === 'eth' || symbol === 'op',
            get: repository.get,
        },
    });

    return { deps, ethereumModule };
};

it('uses only registered modules, with no global fallback', () => {
    const { deps } = createRegistryDeps();
    const registry = createNetworkIconRegistry(deps);
    expect(registry.getNetworkIcon('eth')?.src).toBe('eth.svg');
    expect(registry.getNetworkIcon('btc')).toBeUndefined();
    deps.networkModuleRepository.getSupportedNetworks.mockReturnValue([]);
    deps.networkModuleRepository.isSupportedNetwork.mockReturnValue(false);
    expect(createNetworkIconRegistry(deps).getNetworkIcon('eth')).toBeUndefined();
});

it('resolves native L2 and wrapped-token badges through the registered module', () => {
    const { deps } = createRegistryDeps();
    const registry = createNetworkIconRegistry(deps);
    expect(registry.getTokenIcon({ symbol: 'op', showNetworkIcon: true })).toMatchObject({
        src: 'eth.svg',
        badge: { src: 'op-badge.svg', testnet: false },
    });
    expect(
        registry.getTokenIcon({
            symbol: 'eth',
            contractAddress: 'wrapped',
            wrappedTokenIcon: 'network',
            showNetworkIcon: true,
        }),
    ).toMatchObject({ src: 'eth.svg', badge: { src: 'eth-badge.svg' } });
    expect(registry.getTokenIcon({ symbol: 'op' })).toEqual({ src: 'op.svg' });
});

it('delegates logo identifiers to the nested service, including asynchronous candidates', async () => {
    const { deps, ethereumModule } = createRegistryDeps();
    ethereumModule.icon.getTokenLogoIdentifiers = () => Promise.resolve(['classic', 'derived']);
    const registry = createNetworkIconRegistry(deps);
    expect(
        await registry.getTokenIcon({
            symbol: 'op',
            contractAddress: 'TOKEN',
            showNetworkIcon: true,
        }),
    ).toMatchObject({
        coingeckoId: ethereumModule.getNetworkConfig(asNetworkSymbol('op')).coingeckoId,
        contractAddresses: ['classic', 'derived'],
        badge: { src: 'op-badge.svg' },
    });
});

it('uses the icon service of the app network module', () => {
    const networkModules = createNetworkModulesCompositionRoot({ getTrezorConnect: mock() });
    const repository = createNetworkModuleRepository({ networkModules });
    repository.get(asNetworkSymbol('ada')).icon.getIcons = () => ({
        testnet: false,
        coin: 'app-ada.svg',
        network: 'app-ada-badge.svg',
    });
    const networkModuleRepository = repository;
    const deps: NetworkIconRegistryDeps = {
        networkAssetsRegistry: createNetworkAssetsCompositionRoot({ networkModules }),
        networkModuleRepository: {
            ...networkModuleRepository,
            getSupportedNetworks: () => [asNetworkSymbol('ada')],
        },
    };
    const registry = createNetworkIconRegistry(deps);

    expect(registry.getNetworkIcon('ada')?.src).toBe('app-ada.svg');
    expect(registry.getNetworkIcon('unregistered')).toBeUndefined();
});

it('keeps native asset references intact in the common lookup service', () => {
    const networkModules = createNetworkModulesCompositionRoot({ getTrezorConnect: mock() });
    const repository = createNetworkModuleRepository({ networkModules });
    repository.get(asNetworkSymbol('ada')).icon.getIcons = () => ({
        testnet: false,
        coin: 42,
        network: 43,
    });
    const registry = createNetworkAssetsCompositionRoot({ networkModules });
    expect(registry.getIcon(asNetworkSymbol('ada'))).toEqual({
        testnet: false,
        coin: 42,
        network: 43,
    });
});
