import { type ConnectExplorerApp, createConnectExplorerApp } from './createConnectExplorerApp';
import { connectExplorerNetworkConfig } from '../config/networks';
import { createConnectExplorerNetworkDisplayStore } from '../store/createConnectExplorerNetworkDisplayStore';
import { createConnectExplorerReduxStore } from '../store/createConnectExplorerReduxStore';

type ConnectExplorerCompositionRoot = { app: ConnectExplorerApp };

export const createConnectExplorerCompositionRoot = (): ConnectExplorerCompositionRoot => ({
    app: createConnectExplorerApp({
        services: {
            store: createConnectExplorerReduxStore(),
            networkDisplayStore: createConnectExplorerNetworkDisplayStore({
                networkConfig: connectExplorerNetworkConfig,
            }),
        },
    }),
});
