import { shallowEqual } from 'react-redux';

import {
    type DeviceRootState,
    selectDeviceStaticSessionId,
    selectHasBitcoinOnlyFirmware,
    selectIsPortfolioTrackerDevice,
} from '@suite-common/device';
import {
    formatStakingAmount,
    selectCountedStakingPositionEntriesByAccount,
} from '@suite-common/earn-staking';
import { getStakingPositionAmount, stakingAmountSchema } from '@suite-common/earn-staking-common';
import {
    type NetworksRootState,
    selectNetworkNamesMap,
    selectSupportedNetworkSymbols,
} from '@suite-common/networks';
import { type TokenAddress, type TokenSymbol, toTokenSymbol } from '@suite-common/tokens';
import { type NetworkSymbol } from '@suite-common/wallet-config';
import {
    type FiatRatesRootState,
    type WalletAssetKey,
    type WalletSettingsRootState,
    getWalletAssetKey,
    selectAreHomeAssetSmallBalancesShown,
    selectBaseCurrency,
    selectCurrentFiatRates,
    selectEnabledSupportedNetworks,
    selectHomeAssetsTableGrouping,
    selectIsTokenFiatRateDisallowed,
    selectLastWeekFiatRates,
    selectVisibleDeviceAccounts,
} from '@suite-common/wallet-core';
import {
    type Account,
    type BaseCurrencyAmount,
    asBaseCurrencyAmount,
} from '@suite-common/wallet-types';
import {
    getFiatRateKey,
    hasNetworkFeatures,
    isPositiveBalance,
    isTestnet,
    toFiatCurrency,
} from '@suite-common/wallet-utils';
import {
    createAggregateIndex,
    createDerivedIndex,
    createIndex,
    createSecondaryIndex,
    createWeakMapSelector,
    returnStableArrayIfEmpty,
} from '@trezor/redux-utils';
import { BigNumber } from '@trezor/utils';

import {
    type AssetAccount,
    type AssetAccountsRootState,
    type HiddenTokenReason,
    type HoldingsIndex,
    createHoldingsIndex,
    deviceHoldingsIndex,
    selectDeviceAssetAccountsOfAsset,
} from './assetAccountsSelectors';

export type HomeAssetTableState = AssetAccountsRootState &
    DeviceRootState &
    NetworksRootState &
    FiatRatesRootState &
    WalletSettingsRootState;

const createMemoizedSelector = createWeakMapSelector.withTypes<HomeAssetTableState>();

const ZERO = new BigNumber(0);

const worth = (fiatValue: BigNumber | undefined) => fiatValue ?? ZERO;

const haveSameValues = <TEntity extends object>(previous: TEntity, next: TEntity) =>
    Object.keys(previous).length === Object.keys(next).length &&
    Object.keys(next).every(field => {
        const left = previous[field as keyof TEntity];
        const right = next[field as keyof TEntity];

        return left instanceof BigNumber && right instanceof BigNumber
            ? left.eq(right)
            : left === right;
    });

type WalletAsset = {
    assetKey: WalletAssetKey;
    networkSymbol: NetworkSymbol;
    contractAddress: TokenAddress | undefined;
    cryptoBalance: BigNumber;
    tokenSymbol: TokenSymbol | null;
    tokenDecimals: number | undefined;
    accountCount: number;
    hiddenReason: HiddenTokenReason | undefined;
};

const addAssetAccount = (
    asset: WalletAsset | undefined,
    {
        assetKey,
        networkSymbol,
        contractAddress,
        cryptoBalance,
        tokenInfo,
        hiddenReason,
    }: AssetAccount,
): WalletAsset => {
    const total = worth(asset?.cryptoBalance).plus(cryptoBalance);

    return {
        assetKey,
        networkSymbol,
        contractAddress,
        cryptoBalance: total,
        tokenSymbol:
            asset?.tokenSymbol ??
            (tokenInfo?.symbol === undefined ? null : toTokenSymbol(tokenInfo.symbol)),
        tokenDecimals: asset?.tokenDecimals ?? tokenInfo?.decimals,
        accountCount: (asset?.accountCount ?? 0) + (isPositiveBalance(cryptoBalance) ? 1 : 0),
        hiddenReason: asset?.hiddenReason ?? hiddenReason,
    };
};

type RateEntry = { key: string; rate: number | undefined; usdRate: number | undefined };

const toRateKey = (networkSymbol: NetworkSymbol, contractAddress: TokenAddress | undefined) =>
    contractAddress === undefined ? networkSymbol : `${networkSymbol}-${contractAddress}`;

type HeldAsset = Pick<WalletAsset, 'networkSymbol' | 'contractAddress'>;

const haveSameHeldAssets = (left: readonly HeldAsset[], right: readonly HeldAsset[]) =>
    left.length === right.length && left.every((asset, index) => shallowEqual(asset, right[index]));

const joinRates = ({ networkSymbol, contractAddress }: WalletAsset) => {
    const rateKey = toRateKey(networkSymbol, contractAddress);

    return { rate: rateKey, weekAgoRate: rateKey };
};

type PricedAsset = WalletAsset & {
    fiatValue: BigNumber | undefined;
    weekAgoFiatValue: BigNumber | undefined;
    usdToBaseCurrencyRate: number | undefined;
};

const price = (amount: string, entry: RateEntry | undefined) =>
    entry?.rate === undefined
        ? undefined
        : (toFiatCurrency({ amount, rate: entry.rate }) ?? undefined);

const toPricedAsset = (
    asset: WalletAsset,
    rate: RateEntry | undefined,
    weekAgoRate: RateEntry | undefined,
): PricedAsset => {
    const amount = asset.cryptoBalance.toFixed();

    return {
        ...asset,
        fiatValue: price(amount, rate),
        weekAgoFiatValue: price(amount, weekAgoRate),
        usdToBaseCurrencyRate: rate?.rate && rate.usdRate ? rate.rate / rate.usdRate : undefined,
    };
};

const byValue = (left: PricedAsset, right: PricedAsset) => {
    const isPriced = (asset: PricedAsset) => asset.fiatValue !== undefined;

    if (isPriced(left) !== isPriced(right)) {
        return isPriced(left) ? -1 : 1;
    }

    // `comparedTo` is typed to answer null for a NaN side, which `toFiatCurrency` rules out.
    return worth(right.fiatValue).comparedTo(worth(left.fiatValue)) ?? 0;
};

const byValueThenCryptoBalance = (left: PricedAsset, right: PricedAsset) =>
    byValue(left, right) || (right.cryptoBalance.comparedTo(left.cryptoBalance) ?? 0);

const toAssetKeys = (assets: readonly PricedAsset[]): readonly WalletAssetKey[] =>
    returnStableArrayIfEmpty(assets.map(asset => asset.assetKey));

// Enabled networks are what discovery looks for on a device. The Portfolio Tracker discovers
// nothing: its accounts are imported one by one, on networks that setting may not hold.
const selectAllowedNetworkSymbols = (state: HomeAssetTableState): readonly NetworkSymbol[] =>
    selectIsPortfolioTrackerDevice(state)
        ? selectSupportedNetworkSymbols(state)
        : selectEnabledSupportedNetworks(state);

const SMALL_BALANCE_USD_VALUE = new BigNumber(1);

export type SmallBalanceSummary = {
    assetCount: number;
    fiatValue: BigNumber;
};

const haveSameSmallBalanceSummary = (
    left: SmallBalanceSummary | undefined,
    right: SmallBalanceSummary | undefined,
) => {
    if (left === undefined || right === undefined) {
        return left === right;
    }

    return left.assetCount === right.assetCount && left.fiatValue.eq(right.fiatValue);
};

export const selectIsHomeAssetTableMenuAvailable = (state: HomeAssetTableState) =>
    !selectHasBitcoinOnlyFirmware(state);

export type HomeAssetGrouping = 'default' | 'networks';

/** The saved grouping, or the default one while the menu that sets it is not offered. */
export const selectHomeAssetGrouping = (state: HomeAssetTableState): HomeAssetGrouping =>
    selectIsHomeAssetTableMenuAvailable(state) ? selectHomeAssetsTableGrouping(state) : 'default';

/**
 * The saved switch, or shown while the menu holding it is not offered: nothing else could bring
 * small balances back.
 */
export const selectAreHomeAssetSmallBalancesDisplayed = (state: HomeAssetTableState) =>
    !selectIsHomeAssetTableMenuAvailable(state) || selectAreHomeAssetSmallBalancesShown(state);

const haveSameGrouping = <Group>(
    left: ReadonlyMap<Group, readonly WalletAssetKey[]>,
    right: ReadonlyMap<Group, readonly WalletAssetKey[]>,
) =>
    left.size === right.size &&
    [...left].every(([group, assetKeys]) => shallowEqual(right.get(group), assetKeys));

export type HomeAssetTotals = {
    /** Undefined while nothing the wallet holds can be priced; zero once it holds nothing at all. */
    fiatValue: BigNumber | undefined;
    weekChange: BigNumber | undefined;
    weekChangePercent: BigNumber | undefined;
};

const addUp = (values: readonly (BigNumber | undefined)[]) =>
    values.reduce<BigNumber>((total, value) => total.plus(worth(value)), ZERO);

const getAccountStakingAmount = (state: HomeAssetTableState, account: Account) =>
    selectCountedStakingPositionEntriesByAccount(state, account.key).reduce(
        (total, { position }) => total.plus(getStakingPositionAmount(position)),
        ZERO,
    );

type AssetTableScope<TState extends HomeAssetTableState> = {
    name: string;
    selectAccounts: (state: TState) => readonly Account[];
    holdingsIndex?: HoldingsIndex<TState>;
    isKeptToAllowedNetworks?: boolean;
};

export const createAssetTableSelectors = <TState extends HomeAssetTableState>({
    name,
    selectAccounts,
    holdingsIndex = createHoldingsIndex(`${name}Holdings`, selectAccounts),
    isKeptToAllowedNetworks = true,
}: AssetTableScope<TState>) => {
    const createScopedSelector = createWeakMapSelector.withTypes<TState>();

    const createAssetsIndexes = (
        part: 'shown' | 'hidden',
        sort: (left: PricedAsset, right: PricedAsset) => number,
    ) => {
        const assets = createAggregateIndex({
            name: `${name}${part}Assets`,
            source: holdingsIndex,
            expand: (holdings: readonly AssetAccount[]) =>
                holdings.filter(
                    ({ hiddenReason }) => (hiddenReason === undefined) === (part === 'shown'),
                ),
            getId: (assetAccount: AssetAccount) => assetAccount.assetKey,
            reduce: addAssetAccount,
            isEqual: haveSameValues,
        });
        const selectHeldAssets = createScopedSelector(
            [assets.getEntities],
            (held): HeldAsset[] =>
                held.map(({ networkSymbol, contractAddress }) => ({
                    networkSymbol,
                    contractAddress,
                })),
            { memoizeOptions: { resultEqualityCheck: haveSameHeldAssets } },
        );

        const createRatesIndex = (
            kind: string,
            selectRates: (
                state: TState,
            ) => Readonly<Record<string, Partial<RateEntry> | undefined>> | undefined,
        ) =>
            createIndex({
                name: `${name}${part}${kind}Rates`,
                source: createScopedSelector(
                    [selectHeldAssets, selectRates, selectBaseCurrency],
                    (held, rates, baseCurrency): RateEntry[] =>
                        held.map(({ networkSymbol, contractAddress }) => {
                            const entry =
                                rates?.[
                                    getFiatRateKey(networkSymbol, baseCurrency, contractAddress)
                                ];

                            return {
                                key: toRateKey(networkSymbol, contractAddress),
                                rate: entry?.rate,
                                usdRate: entry?.usdRate,
                            };
                        }),
                ),
                getId: (entry: RateEntry) => entry.key,
            });
        const priced = createDerivedIndex({
            name: `${name}${part}PricedAssets`,
            source: assets,
            join: {
                rate: createRatesIndex('Current', selectCurrentFiatRates),
                weekAgoRate: createRatesIndex('LastWeek', selectLastWeekFiatRates),
            },
            joinBy: joinRates,
            toEntity: (asset: WalletAsset, { rate, weekAgoRate }) =>
                toPricedAsset(asset, rate, part === 'shown' ? weekAgoRate : undefined),
            sort,
            isEqual: haveSameValues,
        });

        return { assets, priced };
    };

    const shown = createAssetsIndexes('shown', byValue);
    const hidden = createAssetsIndexes('hidden', byValueThenCryptoBalance);

    const selectShownAssets = createScopedSelector(
        [
            shown.priced.getEntities,
            (state: TState) =>
                isKeptToAllowedNetworks ? selectAllowedNetworkSymbols(state) : undefined,
        ],
        (assets, allowedNetworks): readonly PricedAsset[] =>
            returnStableArrayIfEmpty(
                assets.filter(
                    asset =>
                        allowedNetworks?.includes(asset.networkSymbol) !== false &&
                        asset.cryptoBalance.gt(0),
                ),
            ),
        { memoizeOptions: { resultEqualityCheck: shallowEqual } },
    );

    const selectShownWalletAssetKeys = createScopedSelector([selectShownAssets], toAssetKeys, {
        memoizeOptions: { resultEqualityCheck: shallowEqual },
    });

    /** Whether there is anything to draw at all: a boolean, so a reorder of the rows is no re-render. */
    const selectHasShownWalletAssets = createScopedSelector(
        [selectShownWalletAssetKeys],
        (assetKeys): boolean => assetKeys.length > 0,
    );

    /**
     * What a dollar is in the chosen currency, as one plain number. Every current rate carries its
     * dollar rate (see `CurrentFiatRatesResult`) and a provider prices everything through one
     * exchange-rate table, so `rate / usdRate` is the same for every asset it holds — one asset's
     * pair is enough. Two providers can sit on slightly different snapshots, so an asset worth almost
     * exactly a dollar may fall on either side of the line; for a switch that hides dust that is
     * nothing. The most valuable priced asset is asked first: its rates are the ones most watched.
     */
    const selectUsdToBaseCurrencyRate = createScopedSelector(
        [selectShownAssets, selectBaseCurrency],
        (assets, baseCurrencyCode): number | undefined =>
            baseCurrencyCode === 'usd'
                ? 1
                : assets.find(asset => asset.usdToBaseCurrencyRate !== undefined)
                      ?.usdToBaseCurrencyRate,
    );

    /**
     * Assets worth under $1 in the selected currency. An unpriced asset is never small, and nothing
     * is small until the USD rate is known, so nothing is hidden by mistake.
     */
    const selectSmallBalanceAssets = createScopedSelector(
        [selectShownAssets, selectUsdToBaseCurrencyRate],
        (assets, usdToBaseCurrencyRate): readonly PricedAsset[] => {
            if (usdToBaseCurrencyRate === undefined) {
                return returnStableArrayIfEmpty([]);
            }

            const threshold = SMALL_BALANCE_USD_VALUE.times(usdToBaseCurrencyRate);

            // Rates and balances are never negative, so neither is a value: no `abs` needed.
            return returnStableArrayIfEmpty(assets.filter(asset => asset.fiatValue?.lt(threshold)));
        },
    );

    const selectSmallBalanceSummary = createScopedSelector(
        [selectSmallBalanceAssets],
        (small): SmallBalanceSummary | undefined =>
            small.length === 0
                ? undefined
                : {
                      assetCount: small.length,
                      fiatValue: addUp(small.map(asset => asset.fiatValue)),
                  },
        { memoizeOptions: { resultEqualityCheck: haveSameSmallBalanceSummary } },
    );

    const selectDisplayedAssets = createScopedSelector(
        [selectShownAssets, selectSmallBalanceAssets, selectAreHomeAssetSmallBalancesDisplayed],
        (assets, small, areSmallBalancesShown): readonly PricedAsset[] =>
            areSmallBalancesShown
                ? assets
                : returnStableArrayIfEmpty(assets.filter(asset => !small.includes(asset))),
        { memoizeOptions: { resultEqualityCheck: shallowEqual } },
    );

    const selectAllDisplayedAssetKeys = createScopedSelector([selectDisplayedAssets], toAssetKeys, {
        memoizeOptions: { resultEqualityCheck: shallowEqual },
    });

    /** How many rows the table may show before it folds, `HOME_ASSET_ROW_LIMIT` on both platforms. */
    const selectRowLimit = (_state: TState, rowLimit?: number) => rowLimit;

    /** Whether the table has more to show than the limit allows: a boolean, so a reorder below it is no re-render. */
    const selectIsHomeAssetTableFoldable = createScopedSelector(
        [selectAllDisplayedAssetKeys, selectRowLimit],
        (assetKeys, rowLimit): boolean => rowLimit !== undefined && assetKeys.length > rowLimit,
    );

    /** The rows to draw, cut to `rowLimit` while the table is folded; every row when none is given. */
    const selectDisplayedWalletAssetKeys = createScopedSelector(
        [selectAllDisplayedAssetKeys, selectRowLimit],
        (assetKeys, rowLimit): readonly WalletAssetKey[] =>
            returnStableArrayIfEmpty(
                rowLimit === undefined ? assetKeys : assetKeys.slice(0, rowLimit),
            ),
        { memoizeOptions: { resultEqualityCheck: shallowEqual } },
    );

    const displayedAssetsIndex = createIndex({
        name: `${name}DisplayedAssets`,
        source: selectDisplayedAssets,
        getId: (asset: PricedAsset) => asset.assetKey,
    });

    const displayedAssetsByNetwork = createSecondaryIndex({
        name: `${name}DisplayedAssetsByNetwork`,
        source: displayedAssetsIndex,
        getKeys: (asset: PricedAsset) => asset.networkSymbol,
    });

    /**
     * What each network is worth. A network nothing can price — a testnet, or rates that have yet
     * to land — is left out: a total of zero would be a lie.
     */
    const selectNetworkFiatValues = createScopedSelector(
        [selectShownAssets],
        (assets): ReadonlyMap<NetworkSymbol, BigNumber> => {
            const byNetwork = new Map<NetworkSymbol, BigNumber>();

            assets.forEach(({ networkSymbol, fiatValue }) => {
                if (fiatValue !== undefined) {
                    byNetwork.set(
                        networkSymbol,
                        worth(byNetwork.get(networkSymbol)).plus(fiatValue),
                    );
                }
            });

            return byNetwork;
        },
    );

    /** The networks the shown assets are held on, the most valuable network first. */
    const selectSortedNetworkSymbols = createScopedSelector(
        [displayedAssetsByNetwork.getKeys, selectNetworkFiatValues],
        (symbols, values): readonly NetworkSymbol[] =>
            returnStableArrayIfEmpty(
                [...symbols].sort(
                    (left, right) =>
                        worth(values.get(right)).comparedTo(worth(values.get(left))) ?? 0,
                ),
            ),
        { memoizeOptions: { resultEqualityCheck: shallowEqual } },
    );

    const selectCappedAssetKeysByNetwork = createScopedSelector(
        [selectSortedNetworkSymbols, displayedAssetsIndex.read, selectRowLimit],
        (symbols, displayed, rowLimit): ReadonlyMap<NetworkSymbol, readonly WalletAssetKey[]> => {
            const capped = new Map<NetworkSymbol, readonly WalletAssetKey[]>();
            let budget = rowLimit ?? Infinity;

            symbols.forEach(symbol => {
                const held = displayed.ids.filter(
                    assetKey => displayed.byId.get(assetKey)?.networkSymbol === symbol,
                );
                const taken = budget >= held.length ? held : held.slice(0, budget);

                if (taken.length === 0) {
                    return;
                }

                capped.set(symbol, taken);
                budget -= taken.length;
            });

            return capped;
        },
        { memoizeOptions: { resultEqualityCheck: haveSameGrouping } },
    );

    const selectCappedNetworkSymbols = createScopedSelector(
        [selectCappedAssetKeysByNetwork],
        (byNetwork): readonly NetworkSymbol[] => returnStableArrayIfEmpty([...byNetwork.keys()]),
        { memoizeOptions: { resultEqualityCheck: shallowEqual } },
    );

    const selectDisplayedNetworkSymbols = createScopedSelector(
        [selectSortedNetworkSymbols, selectCappedNetworkSymbols, selectRowLimit],
        (sorted, capped, rowLimit): readonly NetworkSymbol[] =>
            rowLimit === undefined ? sorted : capped,
    );

    const selectDisplayedWalletAssetKeysOfNetwork = createScopedSelector(
        [
            (state: TState, symbol: NetworkSymbol) =>
                displayedAssetsByNetwork.getIds(state, symbol),
            (state: TState, symbol: NetworkSymbol, rowLimit?: number) =>
                selectCappedAssetKeysByNetwork(state, rowLimit).get(symbol)?.length ?? 0,
        ],
        (assetKeys, count): readonly WalletAssetKey[] =>
            count >= assetKeys.length
                ? assetKeys
                : returnStableArrayIfEmpty(assetKeys.slice(0, count)),
    );

    const selectNetworkFiatValue = (state: TState, symbol: NetworkSymbol) =>
        selectNetworkFiatValues(state).get(symbol)?.toFixed();

    const lookUp =
        <TAsset>(
            selectShown: (state: TState, assetKey: WalletAssetKey) => TAsset | undefined,
            selectHidden: (state: TState, assetKey: WalletAssetKey) => TAsset | undefined,
        ) =>
        (state: TState, assetKey: WalletAssetKey | undefined, isHidden = false) => {
            if (assetKey === undefined) {
                return undefined;
            }

            return isHidden
                ? selectHidden(state, assetKey)
                : (selectShown(state, assetKey) ?? selectHidden(state, assetKey));
        };

    const selectWalletAsset = lookUp(shown.assets.getById, hidden.assets.getById);
    const selectPricedWalletAsset = lookUp(shown.priced.getById, hidden.priced.getById);

    const selectWalletAssetField =
        <TField extends keyof WalletAsset>(field: TField) =>
        (state: TState, assetKey: WalletAssetKey | undefined, isHidden?: boolean) =>
            selectWalletAsset(state, assetKey, isHidden)?.[field];

    const selectWalletAssetNetworkSymbol = selectWalletAssetField('networkSymbol');
    const selectWalletAssetContractAddress = selectWalletAssetField('contractAddress');
    const selectWalletAssetAmount = (
        state: TState,
        assetKey: WalletAssetKey | undefined,
        isHidden?: boolean,
    ) => selectWalletAsset(state, assetKey, isHidden)?.cryptoBalance.toFixed();
    const selectWalletAssetTokenDecimals = selectWalletAssetField('tokenDecimals');
    const selectWalletAssetHiddenReason = selectWalletAssetField('hiddenReason');

    const selectWalletAssetTokenSymbol = (
        state: TState,
        assetKey: WalletAssetKey | undefined,
        isHidden?: boolean,
    ) => selectWalletAsset(state, assetKey, isHidden)?.tokenSymbol ?? null;

    const selectWalletAssetAccountCount = (
        state: TState,
        assetKey: WalletAssetKey | undefined,
        isHidden?: boolean,
    ) => selectWalletAsset(state, assetKey, isHidden)?.accountCount ?? 0;

    const selectWalletAssetFiatValue = (
        state: TState,
        assetKey: WalletAssetKey | undefined,
    ): BaseCurrencyAmount | undefined => {
        const fiatValue = selectPricedWalletAsset(state, assetKey)?.fiatValue;

        return fiatValue === undefined ? undefined : asBaseCurrencyAmount(fiatValue);
    };

    const selectWalletAssetStakingAmount = createScopedSelector(
        [
            (state: TState) => state,
            selectAccounts,
            selectWalletAssetNetworkSymbol,
            selectWalletAssetContractAddress,
        ],
        (state, accounts, networkSymbol, contractAddress): string => {
            if (networkSymbol === undefined || contractAddress !== undefined) {
                return '0';
            }

            const stakingAmount = accounts.reduce(
                (total, account) =>
                    account.symbol === networkSymbol
                        ? total.plus(getAccountStakingAmount(state, account))
                        : total,
                ZERO,
            );

            return formatStakingAmount({
                amount: stakingAmountSchema.parse(stakingAmount.toFixed(0)),
                networkSymbol,
            });
        },
    );

    const selectWalletAssetStakingRatio = createScopedSelector(
        [selectWalletAssetAmount, selectWalletAssetStakingAmount],
        (totalAmount, stakingAmount) => {
            if (
                totalAmount === undefined ||
                !isPositiveBalance(totalAmount) ||
                !isPositiveBalance(stakingAmount)
            ) {
                return undefined;
            }

            return Number(stakingAmount) / Number(totalAmount);
        },
    );

    const selectWalletAssetAvailableAmount = createScopedSelector(
        [selectWalletAssetAmount, selectWalletAssetStakingAmount],
        (totalAmount, stakingAmount) =>
            totalAmount === undefined
                ? undefined
                : new BigNumber(totalAmount).minus(stakingAmount).toFixed(),
    );

    const selectHiddenWalletAssetKeysByReason = createScopedSelector(
        [hidden.priced.getEntities, selectAllowedNetworkSymbols],
        (assets, allowedNetworks): ReadonlyMap<HiddenTokenReason, readonly WalletAssetKey[]> => {
            const byReason = new Map<HiddenTokenReason, WalletAssetKey[]>();

            assets.forEach(({ assetKey, networkSymbol, hiddenReason: reason }) => {
                if (reason !== undefined && allowedNetworks.includes(networkSymbol)) {
                    byReason.set(reason, [...(byReason.get(reason) ?? []), assetKey]);
                }
            });

            return byReason;
        },
        // Rebuilt on every account write, so a rebuild that lands on the same lists is thrown away and
        // each group keeps the array it was handed; the per-reason selector below must stay unchecked.
        { memoizeOptions: { resultEqualityCheck: haveSameGrouping } },
    );

    const selectHiddenWalletAssetKeys = createScopedSelector(
        [
            (state: TState) => selectHiddenWalletAssetKeysByReason(state),
            (_state: TState, reason: HiddenTokenReason) => reason,
        ],
        (byReason, reason): readonly WalletAssetKey[] =>
            returnStableArrayIfEmpty(byReason.get(reason) ?? []),
    );

    const selectHiddenWalletAssetCount = createScopedSelector(
        [selectHiddenWalletAssetKeysByReason],
        byReason =>
            [...byReason.values()].reduce((count, assetKeys) => count + assetKeys.length, 0),
    );

    const selectHasHiddenWalletAssets = createScopedSelector(
        [selectHiddenWalletAssetKeysByReason],
        byReason => byReason.size > 0,
    );

    const selectHomeAssetTotals = createScopedSelector(
        [selectShownAssets],
        (assets): HomeAssetTotals => {
            if (assets.length === 0) {
                return { fiatValue: ZERO, weekChange: ZERO, weekChangePercent: ZERO };
            }

            const priced = assets.filter(asset => asset.fiatValue !== undefined);
            const fiatValue =
                priced.length === 0 ? undefined : addUp(priced.map(asset => asset.fiatValue));

            // An asset priced in only one of the two weeks would read as a gain or a loss it never
            // made, so the change is over the assets both weeks could price.
            const comparable = priced.filter(asset => asset.weekAgoFiatValue !== undefined);
            const weekAgoFiatValue = addUp(comparable.map(asset => asset.weekAgoFiatValue));

            if (weekAgoFiatValue.isZero()) {
                return { fiatValue, weekChange: undefined, weekChangePercent: undefined };
            }

            const weekChange = addUp(comparable.map(asset => asset.fiatValue)).minus(
                weekAgoFiatValue,
            );

            return { fiatValue, weekChange, weekChangePercent: weekChange.div(weekAgoFiatValue) };
        },
    );

    /**
     * Whether an unpriced asset's rate is still on its way. A testnet is never priced, a token whose
     * rate is not fetched never gets one, and a failed fetch has given up, so none is waited for.
     */
    const isRatePending = (state: TState, { networkSymbol, contractAddress }: PricedAsset) =>
        !isTestnet(networkSymbol) &&
        !selectIsTokenFiatRateDisallowed(state, networkSymbol, contractAddress) &&
        !selectCurrentFiatRates(state)?.[
            getFiatRateKey(networkSymbol, selectBaseCurrency(state), contractAddress)
        ]?.error;

    const selectUnpricedAssets = createScopedSelector(
        [selectShownAssets],
        (assets): readonly PricedAsset[] =>
            returnStableArrayIfEmpty(assets.filter(asset => asset.fiatValue === undefined)),
    );

    /** Whether a rate the table still lacks is on its way, so its total is worth waiting for. */
    const selectIsAssetTableRatePending = (state: TState) =>
        selectUnpricedAssets(state).some(asset => isRatePending(state, asset));

    /**
     * Whether the total leaves out a held asset that has no rate to come. One still on its way is
     * not counted: the total is only short of it until it lands.
     */
    const selectIsAssetTableTotalIncomplete = (state: TState) =>
        selectUnpricedAssets(state).length < selectShownAssets(state).length &&
        selectUnpricedAssets(state).some(asset => !isRatePending(state, asset));

    return {
        selectShownWalletAssetKeys,
        selectHasShownWalletAssets,
        selectSmallBalanceSummary,
        selectIsHomeAssetTableFoldable,
        selectDisplayedWalletAssetKeys,
        selectCappedAssetKeysByNetwork,
        selectDisplayedNetworkSymbols,
        selectDisplayedWalletAssetKeysOfNetwork,
        selectNetworkFiatValue,
        selectWalletAssetNetworkSymbol,
        selectWalletAssetContractAddress,
        selectWalletAssetAmount,
        selectWalletAssetAccountCount,
        selectWalletAssetTokenSymbol,
        selectWalletAssetTokenDecimals,
        selectWalletAssetFiatValue,
        selectWalletAssetHiddenReason,
        selectWalletAssetStakingAmount,
        selectWalletAssetStakingRatio,
        selectWalletAssetAvailableAmount,
        selectHiddenWalletAssetKeys,
        selectHiddenWalletAssetCount,
        selectHasHiddenWalletAssets,
        selectHomeAssetTotals,
        selectIsAssetTableRatePending,
        selectIsAssetTableTotalIncomplete,
    };
};

export type AssetTableSelectors<TState extends HomeAssetTableState> = ReturnType<
    typeof createAssetTableSelectors<TState>
>;

export const {
    selectShownWalletAssetKeys,
    selectHasShownWalletAssets,
    selectSmallBalanceSummary,
    selectIsHomeAssetTableFoldable,
    selectDisplayedWalletAssetKeys,
    selectCappedAssetKeysByNetwork,
    selectDisplayedNetworkSymbols,
    selectDisplayedWalletAssetKeysOfNetwork,
    selectNetworkFiatValue,
    selectWalletAssetNetworkSymbol,
    selectWalletAssetContractAddress,
    selectWalletAssetAmount,
    selectWalletAssetAccountCount,
    selectWalletAssetTokenSymbol,
    selectWalletAssetTokenDecimals,
    selectWalletAssetFiatValue,
    selectWalletAssetHiddenReason,
    selectWalletAssetStakingAmount,
    selectWalletAssetStakingRatio,
    selectWalletAssetAvailableAmount,
    selectHiddenWalletAssetKeys,
    selectHiddenWalletAssetCount,
    selectHasHiddenWalletAssets,
    selectHomeAssetTotals,
} = createAssetTableSelectors({
    name: 'home',
    selectAccounts: selectVisibleDeviceAccounts,
    holdingsIndex: deviceHoldingsIndex,
});

export const selectNetworkName = createMemoizedSelector(
    [selectNetworkNamesMap, (_state: HomeAssetTableState, symbol: NetworkSymbol) => symbol],
    (names, symbol) => names?.[symbol],
);

export const selectWalletAssetKey = createMemoizedSelector(
    [
        selectDeviceStaticSessionId,
        (_state: HomeAssetTableState, networkSymbol: NetworkSymbol) => networkSymbol,
        (
            _state: HomeAssetTableState,
            _networkSymbol: NetworkSymbol,
            tokenContract?: TokenAddress,
        ) => tokenContract,
    ],
    (deviceState, networkSymbol, tokenContract) =>
        deviceState === null
            ? undefined
            : getWalletAssetKey({
                  deviceState,
                  networkSymbol,
                  contractAddress: tokenContract,
              }),
);

export const selectWalletAssetHoldings = createMemoizedSelector(
    [selectDeviceAssetAccountsOfAsset],
    (assetAccounts): readonly AssetAccount[] =>
        returnStableArrayIfEmpty(
            assetAccounts.filter(assetAccount => isPositiveBalance(assetAccount.cryptoBalance)),
        ),
);

export const selectWalletAssetSignVerifyAccounts = createMemoizedSelector(
    [selectVisibleDeviceAccounts, selectWalletAssetNetworkSymbol],
    (accounts, networkSymbol) =>
        returnStableArrayIfEmpty(
            accounts.filter(
                account =>
                    account.symbol === networkSymbol && hasNetworkFeatures(account, 'sign-verify'),
            ),
        ),
);
