import { useMemo } from 'react';

import { asNetworkSymbol } from '@trezor/network-module-types';

import { useServices } from '../../services/ServicesProvider';

import { type CommonIconSetProps, IconSetBase, IconWrapper } from '../IconSet/IconSetBase';
import { TokenIcon } from '../TokenIcon/TokenIcon';
import { NativeTokenIcon } from '../TokenIcon/NativeTokenIcon';
import { getIconUrl } from '../TokenIcon/getTokenIconSources';

export type TokenIconSetToken = {
    contract?: string | null;
    symbol?: string;
    networkSymbol?: string;
};

export type TokenIconSetProps = CommonIconSetProps & {
    symbol: string;
    tokens: readonly TokenIconSetToken[];
    isTransparent?: boolean;
};

export const TokenIconSet = ({
    symbol,
    tokens,
    size,
    gap,
    maxVisibleIcons = 3,
    isCountVisible = false,
    isCentered = false,
    isReversed = false,
    isTransparent = false,
}: TokenIconSetProps) => {
    const deps = useServices();
    const { length } = tokens;

    const visibleTokensContent = useMemo(() => {
        const visibleTokens = maxVisibleIcons !== null ? tokens.slice(0, maxVisibleIcons) : tokens;

        return visibleTokens.map(token => {
            const tokenNetworkSymbol = token.networkSymbol ?? symbol;
            const key = `${tokenNetworkSymbol}-${token.contract ?? token.symbol ?? symbol}`;
            const nativeSrc = token.contract
                ? undefined
                : getIconUrl(
                      deps.getNetworkIcon(tokenNetworkSymbol)?.nativeSrc ??
                          deps.getIcon(asNetworkSymbol(tokenNetworkSymbol)).coin,
                  );

            return (
                <IconWrapper key={key} $size={size} $gap={gap} $length={length}>
                    {token.contract ? (
                        <TokenIcon
                            size={size}
                            symbol={tokenNetworkSymbol}
                            contractAddress={token.contract ?? null}
                            placeholder={token.symbol ?? ''}
                            placeholderWithTooltip={false}
                            shouldTryToFetch
                            isBordered={false}
                            isTransparent={isTransparent}
                        />
                    ) : nativeSrc ? (
                        <NativeTokenIcon size={size} src={nativeSrc} />
                    ) : null}
                </IconWrapper>
            );
        });
    }, [deps, tokens, maxVisibleIcons, symbol, size, gap, length, isTransparent]);

    return (
        <IconSetBase
            count={length}
            size={size}
            gap={gap}
            maxVisibleIcons={maxVisibleIcons}
            isCountVisible={isCountVisible}
            isCentered={isCentered}
            isReversed={isReversed}
        >
            {visibleTokensContent}
        </IconSetBase>
    );
};
