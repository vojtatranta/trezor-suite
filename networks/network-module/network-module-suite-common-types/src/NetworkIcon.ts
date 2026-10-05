import type { NetworkIcons } from '@trezor/network-assets-types';

/** @serviceContract */
export type NetworkIcon<TSymbol extends string = string> = {
    getIcons(symbol: TSymbol): NetworkIcons;

    /**
     * Returns candidate logo CDN lookup keys for a token's contract or asset ID.
     * Each family handles normalization and may resolve keys asynchronously.
     */
    getTokenLogoIdentifiers(
        symbol: TSymbol,
        contract: string,
    ): readonly string[] | Promise<readonly string[]>;

    /**
     * Detects wrapped native tokens (e.g. WETH) to use the native coin icon when requested.
     * Optional; callers treat an absent method as false.
     */
    isWrappedNativeToken?(symbol: TSymbol, contract: string): boolean;
};
