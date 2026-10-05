import { type PropsWithChildren, type ReactNode, useState } from 'react';

import { IntlProviderForTests } from '@suite/intl';
import { ServicesProvider, mock, useServices } from '@suite-common/dependency-injection';
import { MockedFormatterProvider } from '@suite-common/formatters/mocks';
import {
    createNetworkAssetsCompositionRoot,
    createNetworkIconRegistry,
    injectNetworkIconRegistry,
    createNetworkModuleRepository,
    createNetworkModulesCompositionRoot,
} from '@suite-common/networks';
import { ServicesProvider as ProductComponentsServicesProvider } from '@trezor/product-components';
import { ConnectedThemeProvider, ResponsiveContextProvider } from '@trezor/suite';

const IconServicesProvider = ({ children }: { children: ReactNode }) => {
    const deps = useServices(injectNetworkIconRegistry);

    return (
        <ProductComponentsServicesProvider services={deps.networkIconRegistry}>
            {children}
        </ProductComponentsServicesProvider>
    );
};

type BasicProviderForTestsProps = PropsWithChildren<{ services?: object }>;

export const BasicProviderForTests = ({ children, services = {} }: BasicProviderForTestsProps) => {
    const [networkIconRegistry] = useState(() => {
        const networkModules = createNetworkModulesCompositionRoot({ getTrezorConnect: mock() });

        return createNetworkIconRegistry({
            networkModuleRepository: createNetworkModuleRepository({ networkModules }),
            networkAssetsRegistry: createNetworkAssetsCompositionRoot({ networkModules }),
        });
    });

    return (
        <ServicesProvider services={{ networkIconRegistry, ...services }}>
            <IconServicesProvider>
                <ConnectedThemeProvider>
                    <ResponsiveContextProvider>
                        <IntlProviderForTests>
                            <MockedFormatterProvider>{children}</MockedFormatterProvider>
                        </IntlProviderForTests>
                    </ResponsiveContextProvider>
                </ConnectedThemeProvider>
            </IconServicesProvider>
        </ServicesProvider>
    );
};
