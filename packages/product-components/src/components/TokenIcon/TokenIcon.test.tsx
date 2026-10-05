/** @jest-environment jsdom */

import { ThemeProvider } from 'styled-components';

import { render, screen } from '@testing-library/react';
import { intermediaryTheme } from '@trezor/components';

import { TokenIcon } from './TokenIcon';
import type { ProductComponentsServices } from '../../services/ProductComponentsServices';
import { ServicesProvider } from '../../services/ServicesProvider';

type ReactSVGProps = { src: string };
jest.mock('react-svg', () => ({
    ReactSVG: ({ src }: ReactSVGProps) => <img src={src} alt="native asset" />,
}));

it('reads native icons lazily from context and responds when the injected services change', () => {
    const services: ProductComponentsServices = {
        getIcon: jest.fn(() => ({ coin: 'custom.svg', network: 'badge.svg', testnet: false })),
        getNetworkIcon: () => undefined,
        getTokenIcon: () => undefined,
    };
    const view = (deps: ProductComponentsServices) => (
        <ServicesProvider services={deps}>
            <ThemeProvider theme={{ ...intermediaryTheme.light, variant: 'light' }}>
                <TokenIcon symbol="ada" />
            </ThemeProvider>
        </ServicesProvider>
    );
    expect(services.getIcon).not.toHaveBeenCalled();
    const { rerender } = render(view(services));
    expect(services.getIcon).toHaveBeenCalledWith('ada');
    expect(screen.getByRole('img').getAttribute('src')).toBe('custom.svg');
    const updated: ProductComponentsServices = {
        ...services,
        getIcon: () => ({ coin: 'updated.svg', network: 'badge.svg', testnet: false }),
    };
    rerender(view(updated));
    expect(screen.getByRole('img').getAttribute('src')).toBe('updated.svg');
});
