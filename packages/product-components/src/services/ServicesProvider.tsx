import { type ReactNode, createContext, useContext } from 'react';

import type { ProductComponentsServices } from './ProductComponentsServices';

const ServicesContext = createContext<ProductComponentsServices | null>(null);

type ServicesProviderProps = {
    services: ProductComponentsServices;
    children: ReactNode;
};

export const ServicesProvider = ({ services, children }: ServicesProviderProps) => (
    <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>
);

export const useServices = (): ProductComponentsServices => {
    const services = useContext(ServicesContext);
    if (services === null) {
        throw new Error('Product components require a ServicesProvider.');
    }

    return services;
};
