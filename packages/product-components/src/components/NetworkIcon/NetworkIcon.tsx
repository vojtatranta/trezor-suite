import { ReactSVG } from 'react-svg';

import styled from 'styled-components';

import { asNetworkSymbol } from '@trezor/network-module-types';

import { useServices } from '../../services/ServicesProvider';

export const allowedNetworkIconSizes = [8, 12, 16, 20, 24, 32, 40, 48, 64] as const;
export type NetworkIconSize = (typeof allowedNetworkIconSizes)[number];

const IconWrapper = styled.div<{ $size: NetworkIconSize; $isTestnet: boolean }>`
    display: flex;
    flex-shrink: 0;
    width: ${({ $size }) => $size}px;
    height: ${({ $size }) => $size}px;
    overflow: hidden;
    border-radius: 25%;
    background: ${({ $isTestnet, theme }) =>
        $isTestnet ? theme.elementFillCriticalBold : theme.elementFillContrast};
    color: ${({ $isTestnet, theme }) =>
        $isTestnet ? theme.contentOnDarkPrimary : theme.contentPrimaryInverse};
`;

const StyledReactSVG = styled(ReactSVG)`
    display: flex;
    width: 100%;
    height: 100%;

    div {
        display: flex;
        width: 100%;
        height: 100%;
    }

    svg {
        display: block;
        width: 100%;
        height: 100%;
    }
` as typeof ReactSVG;

export interface NetworkIconProps {
    networkSymbol: string;
    size?: NetworkIconSize;
    'data-testid'?: string;
}

export function NetworkIcon({
    networkSymbol,
    size = 32,
    'data-testid': dataTestId,
}: NetworkIconProps) {
    const deps = useServices();
    const icons = deps.getIcon(asNetworkSymbol(networkSymbol));
    if (typeof icons.network !== 'string') return null;
    const isTestnet = icons.testnet;

    return (
        <IconWrapper $size={size} $isTestnet={isTestnet} data-testid={dataTestId}>
            <StyledReactSVG
                src={icons.network}
                beforeInjection={svg => {
                    svg.setAttribute('width', `${size}px`);
                    svg.setAttribute('height', `${size}px`);
                }}
                loading={() => <span className="loading" />}
            />
        </IconWrapper>
    );
}
