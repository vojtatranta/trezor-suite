import type { ReactNode } from 'react';

import { act, renderHook } from '@testing-library/react';
import { type NetworkConfigState, asNetworkSymbol } from '@trezor/network-module-types';

import {
    type NetworkDisplayDeps,
    NetworkDisplayProvider,
    useNetworkDisplaySelector,
} from './NetworkDisplayProvider';
import { selectNetworkOptions } from './networkDisplaySelectors';
import { useServices } from '../services/ServicesProvider';

type WrapperProps = { children: ReactNode };
const bitcoin = asNetworkSymbol('btc');

it('exposes icon services separately from the subscribed network labels', () => {
    let state: NetworkConfigState = { networks: { [bitcoin]: { name: 'Bitcoin' } } };
    const listeners = new Set<() => void>();
    const getIcon = jest.fn(() => ({ coin: 'bitcoin.svg', network: 42, testnet: false }));
    const deps: NetworkDisplayDeps = {
        store: {
            getState: () => state,
            subscribe: callback => {
                listeners.add(callback);
                return () => {
                    listeners.delete(callback);
                };
            },
        },
        services: { getIcon, getNetworkIcon: () => undefined, getTokenIcon: () => undefined },
    };
    const wrapper = ({ children }: WrapperProps) => (
        <NetworkDisplayProvider {...deps}>{children}</NetworkDisplayProvider>
    );
    const { result, rerender } = renderHook(
        () => ({
            networks: useNetworkDisplaySelector(selectNetworkOptions),
            services: useServices(),
        }),
        { wrapper },
    );
    const firstNetworks = result.current.networks;
    rerender();
    expect(result.current.networks).toBe(firstNetworks);
    expect(result.current.services).toBe(deps.services);
    expect(getIcon).not.toHaveBeenCalled();
    expect(result.current.services.getIcon(bitcoin)).toEqual({
        coin: 'bitcoin.svg',
        network: 42,
        testnet: false,
    });
    act(() => {
        state = { networks: { [bitcoin]: { name: 'Updated Bitcoin' } } };
        listeners.forEach(callback => callback());
    });
    expect(result.current.networks).toEqual([{ symbol: bitcoin, name: 'Updated Bitcoin' }]);
    expect(result.current.services).toBe(deps.services);
});
