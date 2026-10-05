import {
    type ReactNode,
    createContext,
    useCallback,
    useContext,
    useMemo,
    useSyncExternalStore,
} from 'react';

import { createSelector } from 'reselect';

import type { NetworkConfigState, NetworkConfigStore } from '@trezor/network-module-types';

import type { ProductComponentsServices } from '../services/ProductComponentsServices';
import { ServicesProvider } from '../services/ServicesProvider';

export type NetworkDisplayDeps = {
    store: NetworkConfigStore;
    services: ProductComponentsServices;
};

const NetworkDisplayContext = createContext<NetworkConfigStore | null>(null);

type NetworkDisplayProviderProps = NetworkDisplayDeps & {
    children: ReactNode;
};

export const NetworkDisplayProvider = ({
    store,
    services,
    children,
}: NetworkDisplayProviderProps) => (
    <NetworkDisplayContext.Provider value={store}>
        <ServicesProvider services={services}>{children}</ServicesProvider>
    </NetworkDisplayContext.Provider>
);

export const useNetworkDisplaySelector = <TSelected,>(
    selector: (state: NetworkConfigState) => TSelected,
) => {
    const store = useContext(NetworkDisplayContext);
    if (store === null) {
        throw new Error('Network display components require a NetworkDisplayProvider.');
    }

    const selectDisplay = useMemo(
        () => createSelector([(state: NetworkConfigState) => state], selector),
        [selector],
    );
    const getSnapshot = useCallback(() => selectDisplay(store.getState()), [store, selectDisplay]);

    return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
};
