import { useMemo } from 'react';

import type { TokenIconData } from '@trezor/network-assets-types';
import { asNetworkSymbol } from '@trezor/network-module-types';
import { useAsyncMemo } from '@trezor/react-utils';

import { NativeTokenIcon } from './NativeTokenIcon';
import { NonNativeTokenIcon } from './NonNativeTokenIcon';
import { getIconUrl, getTokenIconSources } from './getTokenIconSources';
import { type TokenIconProps } from './tokenIconTypes';
import { NetworkIconBadge } from '../NetworkIcon/NetworkIconBadge';
import { useServices } from '../../services/ServicesProvider';

const EMPTY_SOURCES: [] = [];

export const TokenIcon = ({
    symbol,
    contractAddress,
    wrappedTokenIcon,
    showNetworkIcon,
    customLogoUrl,
    size = 32,
    ...props
}: TokenIconProps) => {
    const deps = useServices();
    const data = useAsyncMemo<TokenIconData | undefined>(
        () =>
            !contractAddress && !showNetworkIcon
                ? { src: deps.getIcon(asNetworkSymbol(symbol)).coin }
                : deps.getTokenIcon({ symbol, contractAddress, wrappedTokenIcon, showNetworkIcon }),
        [deps, symbol, contractAddress, wrappedTokenIcon, showNetworkIcon],
    );
    const sources = useMemo(
        () =>
            data?.coingeckoId
                ? getTokenIconSources(data.coingeckoId, data.contractAddresses, size, customLogoUrl)
                : undefined,
        [data, size, customLogoUrl],
    );
    const tokenSources = sources ?? (contractAddress && !data ? EMPTY_SOURCES : undefined);
    const src = getIconUrl(data?.src);
    const icon = tokenSources ? (
        <NonNativeTokenIcon {...props} symbol={symbol} size={size} sources={tokenSources} />
    ) : src ? (
        <NativeTokenIcon src={src} size={size} data-testid={props['data-testid']} />
    ) : null;

    return data?.badge ? (
        <NetworkIconBadge networkSymbol={symbol} parentSize={size}>
            {icon}
        </NetworkIconBadge>
    ) : (
        icon
    );
};
