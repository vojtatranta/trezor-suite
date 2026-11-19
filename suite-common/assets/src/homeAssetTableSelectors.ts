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
    selectLastWeekFiatRates,
    selectVisibleDeviceAccounts,
} from '@suite-common/wallet-core';
import {
    type Account,
    type AccountKey,
    type BaseCurrencyAmount,
    asBaseCurrencyAmount,
} from '@suite-common/wallet-types';
import { hasNetworkFeatures, isPositiveBalance, toFiatCurrency } from '@suite-common/wallet-utils';
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
    selectDeviceAssetAccounts,
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

/** Shallow equality, except that two numbers are the same number rather than the same object. */
const haveSameValues = <TEntity extends object>(previous: TEntity, next: TEntity) =>
    Object.keys(previous).length === Object.keys(next).length &&
    Object.keys(next).every(field => {
        const left = previous[field as keyof TEntity];
        const right = next[field as keyof TEntity];

        return left instanceof BigNumber && right instanceof BigNumber
            ? left.eq(right)
            : left === right;
    });

// --- What the wallet holds: its asset accounts, the shown ones and the hidden ones apart.

const selectPartitionedAssetAccounts = createMemoizedSelector(
    [selectDeviceAssetAccounts],
    assetAccounts => ({
        shown: assetAccounts.filter(({ hiddenReason }) => hiddenReason === undefined),
        hidden: assetAccounts.filter(({ hiddenReason }) => hiddenReason !== undefined),
    }),
);

const createAssetAccountsIndex = (name: string, part: 'shown' | 'hidden') =>
    createIndex({
        name,
        source: (state: HomeAssetTableState) => selectPartitionedAssetAccounts(state)[part],
        getId: (assetAccount: AssetAccount) => assetAccount.assetAccountKey,
    });

const shownAssetAccountsIndex = createAssetAccountsIndex('homeShownAssetAccounts', 'shown');
const hiddenAssetAccountsIndex = createAssetAccountsIndex('homeHiddenAssetAccounts', 'hidden');

type WalletAsset = {
    assetKey: WalletAssetKey;
    networkSymbol: NetworkSymbol;
    contractAddress: TokenAddress | undefined;
    cryptoBalance: BigNumber;
    amount: string;
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
        amount: total.toFixed(),
        tokenSymbol:
            asset?.tokenSymbol ??
            (tokenInfo?.symbol === undefined ? null : toTokenSymbol(tokenInfo.symbol)),
        tokenDecimals: asset?.tokenDecimals ?? tokenInfo?.decimals,
        accountCount: (asset?.accountCount ?? 0) + (isPositiveBalance(cryptoBalance) ? 1 : 0),
        hiddenReason: asset?.hiddenReason ?? hiddenReason,
    };
};

// The asset accounts folded into one asset per coin or token, across the accounts holding it.
const createAssetsIndex = (name: string, source: typeof shownAssetAccountsIndex) =>
    createAggregateIndex({
        name,
        source,
        expand: (assetAccount: AssetAccount) => [assetAccount],
        getId: (assetAccount: AssetAccount) => assetAccount.assetKey,
        reduce: addAssetAccount,
        isEqual: haveSameValues,
    });

const assetsIndex = createAssetsIndex('homeAssets', shownAssetAccountsIndex);
const hiddenAssetsIndex = createAssetsIndex('homeHiddenAssets', hiddenAssetAccountsIndex);

// --- The rates in the base currency, by the asset they price. A rate is an entity, so rates
// rewritten with the same numbers change nothing, and one that moved reaches only what it prices.

type RateEntry = { key: string; rate: number | undefined; usdRate: number | undefined };

const toRateKey = (networkSymbol: NetworkSymbol, contractAddress: TokenAddress | undefined) =>
    contractAddress === undefined ? networkSymbol : `${networkSymbol}-${contractAddress}`;

type FiatRates = Readonly<Record<string, { rate?: number; usdRate?: number } | undefined>>;

const toRateEntries = (
    rates: FiatRates | undefined,
    baseCurrency: ReturnType<typeof selectBaseCurrency>,
): RateEntry[] => {
    const suffix = `-${baseCurrency}`;

    return Object.entries(rates ?? {})
        .filter(([key]) => key.endsWith(suffix))
        .map(([key, entry]) => ({
            key: key.slice(0, -suffix.length),
            rate: entry?.rate,
            usdRate: entry?.usdRate,
        }));
};

const createRatesIndex = (
    name: string,
    selectRates: (state: HomeAssetTableState) => FiatRates | undefined,
) =>
    createIndex({
        name,
        source: createMemoizedSelector([selectRates, selectBaseCurrency], toRateEntries),
        getId: (entry: RateEntry) => entry.key,
    });

const currentRatesIndex = createRatesIndex('homeCurrentRates', selectCurrentFiatRates);
const lastWeekRatesIndex = createRatesIndex('homeLastWeekRates', selectLastWeekFiatRates);

// --- The assets priced, the most valuable first. What nothing can price goes below everything
// that can, even below what is worth zero.

type PricedAsset = WalletAsset & {
    fiatValue: BigNumber | undefined;
    weekAgoFiatValue: BigNumber | undefined;
    /** What a dollar is in the base currency, by this asset's rate; see `selectUsdToBaseCurrencyRate`. */
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
): PricedAsset => ({
    ...asset,
    fiatValue: price(asset.amount, rate),
    weekAgoFiatValue: price(asset.amount, weekAgoRate),
    usdToBaseCurrencyRate: rate?.rate && rate.usdRate ? rate.rate / rate.usdRate : undefined,
});

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

const ratesJoin = { rate: currentRatesIndex, weekAgoRate: lastWeekRatesIndex };

const joinRates = ({
    networkSymbol,
    contractAddress,
}: Pick<WalletAsset, 'networkSymbol'> & Pick<WalletAsset, 'contractAddress'>) => {
    const rateKey = toRateKey(networkSymbol, contractAddress);

    return { rate: rateKey, weekAgoRate: rateKey };
};

const pricedAssetsIndex = createDerivedIndex({
    name: 'homePricedAssets',
    source: assetsIndex,
    join: ratesJoin,
    joinBy: joinRates,
    toEntity: (asset: WalletAsset, { rate, weekAgoRate }) =>
        toPricedAsset(asset, rate, weekAgoRate),
    sort: byValue,
    isEqual: haveSameValues,
});

const pricedHiddenAssetsIndex = createDerivedIndex({
    name: 'homePricedHiddenAssets',
    source: hiddenAssetsIndex,
    join: ratesJoin,
    joinBy: joinRates,
    toEntity: (asset: WalletAsset, { rate }) => toPricedAsset(asset, rate, undefined),
    sort: byValueThenCryptoBalance,
    isEqual: haveSameValues,
});

// --- Each account's own holdings, priced: what the overview of one account lists.

type PricedAccountAsset = PricedAsset & { accountKey: AccountKey };

const pricedAccountAssetsIndex = createDerivedIndex({
    name: 'homePricedAccountAssets',
    source: shownAssetAccountsIndex,
    join: ratesJoin,
    joinBy: joinRates,
    toEntity: (assetAccount: AssetAccount, { rate, weekAgoRate }): PricedAccountAsset => ({
        ...toPricedAsset(addAssetAccount(undefined, assetAccount), rate, weekAgoRate),
        accountKey: assetAccount.accountKey,
    }),
    isEqual: haveSameValues,
});

const pricedAssetsByAccount = createSecondaryIndex({
    name: 'homePricedAssetsByAccount',
    source: pricedAccountAssetsIndex,
    getKeys: (asset: PricedAccountAsset) => asset.accountKey,
});

// --- The rows of a table: the wallet's, or with an account key, that account's alone.

// Enabled networks are what discovery looks for on a device. The Portfolio Tracker discovers
// nothing: its accounts are imported one by one, on networks that setting may not hold.
const selectAllowedNetworkSymbols = (state: HomeAssetTableState): readonly NetworkSymbol[] =>
    selectIsPortfolioTrackerDevice(state)
        ? selectSupportedNetworkSymbols(state)
        : selectEnabledSupportedNetworks(state);

// Sorted per account, as it is read: sorting every account's holdings on each rate would cost
// what only the account on screen needs.
const selectAccountPricedAssets = createMemoizedSelector(
    [
        (state: HomeAssetTableState, accountKey: AccountKey) =>
            pricedAssetsByAccount.getEntities(state, accountKey),
    ],
    (assets): readonly PricedAsset[] => [...assets].sort(byValue),
);

const selectPricedAssets = (
    state: HomeAssetTableState,
    accountKey?: AccountKey,
): readonly PricedAsset[] =>
    accountKey === undefined
        ? pricedAssetsIndex.getEntities(state)
        : selectAccountPricedAssets(state, accountKey);

// An account asked for by key is listed whatever networks the wallet has enabled.
const selectShownNetworkSymbols = (state: HomeAssetTableState, accountKey?: AccountKey) =>
    accountKey === undefined ? selectAllowedNetworkSymbols(state) : undefined;

const selectShownAssets = createMemoizedSelector(
    [selectPricedAssets, selectShownNetworkSymbols],
    (assets, shownNetworks): readonly PricedAsset[] =>
        returnStableArrayIfEmpty(
            assets.filter(
                asset =>
                    shownNetworks?.includes(asset.networkSymbol) !== false &&
                    asset.cryptoBalance.gt(0),
            ),
        ),
    { memoizeOptions: { resultEqualityCheck: shallowEqual } },
);

const toAssetKeys = (assets: readonly PricedAsset[]): readonly WalletAssetKey[] =>
    returnStableArrayIfEmpty(assets.map(asset => asset.assetKey));

export const selectShownWalletAssetKeys = createMemoizedSelector([selectShownAssets], toAssetKeys, {
    memoizeOptions: { resultEqualityCheck: shallowEqual },
});

/** Whether there is anything to draw at all: a boolean, so a reorder of the rows is no re-render. */
export const selectHasShownWalletAssets = createMemoizedSelector(
    [selectShownWalletAssetKeys],
    (assetKeys): boolean => assetKeys.length > 0,
);

// --- Small balances.

const SMALL_BALANCE_USD_VALUE = new BigNumber(1);

/**
 * What a dollar is in the chosen currency, as one plain number. Every current rate carries its dollar
 * rate (see `CurrentFiatRatesResult`) and a provider prices everything through one exchange-rate
 * table, so `rate / usdRate` is the same for every asset it holds — one asset's pair is enough, and
 * nothing need be priced twice. Two providers can sit on slightly different snapshots, so an asset
 * worth almost exactly a dollar may fall on either side of the line; for a switch that hides dust
 * that is nothing. The most valuable priced asset is asked first: its rates are the ones most watched.
 */
const selectUsdToBaseCurrencyRate = createMemoizedSelector(
    [selectShownAssets, selectBaseCurrency],
    (assets, baseCurrencyCode): number | undefined =>
        baseCurrencyCode === 'usd'
            ? 1
            : assets.find(asset => asset.usdToBaseCurrencyRate !== undefined)
                  ?.usdToBaseCurrencyRate,
);

/**
 * Assets worth under $1 in the selected currency. An unpriced asset is never small, and nothing is
 * small until the USD rate is known, so nothing is hidden by mistake.
 */
const selectSmallBalanceAssets = createMemoizedSelector(
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

export const selectSmallBalanceSummary = createMemoizedSelector(
    [selectSmallBalanceAssets],
    (small): SmallBalanceSummary | undefined =>
        small.length === 0
            ? undefined
            : {
                  assetCount: small.length,
                  fiatValue: small.reduce(
                      (total, asset) => total.plus(worth(asset.fiatValue)),
                      ZERO,
                  ),
              },
    { memoizeOptions: { resultEqualityCheck: haveSameSmallBalanceSummary } },
);

export const selectIsHomeAssetTableMenuAvailable = (state: HomeAssetTableState) =>
    !selectHasBitcoinOnlyFirmware(state);

/** The saved grouping, or the default one while the menu that sets it is not offered. */
export const selectHomeAssetGrouping = (state: HomeAssetTableState): HomeAssetGrouping =>
    selectIsHomeAssetTableMenuAvailable(state) ? selectHomeAssetsTableGrouping(state) : 'default';

/**
 * The saved switch, or shown while the menu holding it is not offered: nothing else could bring
 * small balances back.
 */
export const selectAreHomeAssetSmallBalancesDisplayed = (state: HomeAssetTableState) =>
    !selectIsHomeAssetTableMenuAvailable(state) || selectAreHomeAssetSmallBalancesShown(state);

const selectDisplayedAssets = createMemoizedSelector(
    [
        selectShownAssets,
        selectSmallBalanceAssets,
        (state: HomeAssetTableState) => selectAreHomeAssetSmallBalancesDisplayed(state),
    ],
    (assets, small, areSmallBalancesShown): readonly PricedAsset[] =>
        areSmallBalancesShown
            ? assets
            : returnStableArrayIfEmpty(assets.filter(asset => !small.includes(asset))),
    { memoizeOptions: { resultEqualityCheck: shallowEqual } },
);

const selectAllDisplayedAssetKeys = createMemoizedSelector([selectDisplayedAssets], toAssetKeys, {
    memoizeOptions: { resultEqualityCheck: shallowEqual },
});

/** How many rows the table may show before it folds, `HOME_ASSET_ROW_LIMIT` on both platforms. */
const selectRowLimit = (_state: HomeAssetTableState, rowLimit?: number) => rowLimit;

const selectAllDisplayedAssetKeysOf = (
    state: HomeAssetTableState,
    _rowLimit?: number,
    accountKey?: AccountKey,
) => selectAllDisplayedAssetKeys(state, accountKey);

/** Whether the table has more to show than the limit allows: a boolean, so a reorder below it is no re-render. */
export const selectIsHomeAssetTableFoldable = createMemoizedSelector(
    [selectAllDisplayedAssetKeysOf, selectRowLimit],
    (assetKeys, rowLimit): boolean => rowLimit !== undefined && assetKeys.length > rowLimit,
);

/** The rows to draw, cut to `rowLimit` while the table is folded; every row when none is given. */
export const selectDisplayedWalletAssetKeys = createMemoizedSelector(
    [selectAllDisplayedAssetKeysOf, selectRowLimit],
    (assetKeys, rowLimit): readonly WalletAssetKey[] =>
        returnStableArrayIfEmpty(rowLimit === undefined ? assetKeys : assetKeys.slice(0, rowLimit)),
    { memoizeOptions: { resultEqualityCheck: shallowEqual } },
);

// --- The rows grouped by network.

export type HomeAssetGrouping = 'default' | 'networks';

const displayedAssetsIndex = createIndex({
    name: 'homeDisplayedAssets',
    source: (state: HomeAssetTableState) => selectDisplayedAssets(state),
    getId: (asset: PricedAsset) => asset.assetKey,
});

const displayedAssetsByNetwork = createSecondaryIndex({
    name: 'homeDisplayedAssetsByNetwork',
    source: displayedAssetsIndex,
    getKeys: (asset: PricedAsset) => asset.networkSymbol,
});

/**
 * What each network is worth. A network nothing can price — a testnet, or rates that have yet to
 * land — is left out: a total of zero would be a lie.
 */
const selectNetworkFiatValues = createMemoizedSelector(
    [(state: HomeAssetTableState) => selectShownAssets(state)],
    (assets): ReadonlyMap<NetworkSymbol, BigNumber> => {
        const byNetwork = new Map<NetworkSymbol, BigNumber>();

        assets.forEach(({ networkSymbol, fiatValue }) => {
            if (fiatValue !== undefined) {
                byNetwork.set(networkSymbol, worth(byNetwork.get(networkSymbol)).plus(fiatValue));
            }
        });

        return byNetwork;
    },
);

/** The networks the shown assets are held on, the most valuable network first. */
const selectSortedNetworkSymbols = createMemoizedSelector(
    [displayedAssetsByNetwork.getKeys, selectNetworkFiatValues],
    (symbols, values): readonly NetworkSymbol[] =>
        returnStableArrayIfEmpty(
            [...symbols].sort(
                (left, right) => worth(values.get(right)).comparedTo(worth(values.get(left))) ?? 0,
            ),
        ),
    { memoizeOptions: { resultEqualityCheck: shallowEqual } },
);

export const selectCappedAssetKeysByNetwork = createMemoizedSelector(
    [
        (state: HomeAssetTableState) => selectSortedNetworkSymbols(state),
        displayedAssetsIndex.read,
        selectRowLimit,
    ],
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
);

const selectCappedNetworkSymbols = createMemoizedSelector(
    [selectCappedAssetKeysByNetwork],
    (byNetwork): readonly NetworkSymbol[] => returnStableArrayIfEmpty([...byNetwork.keys()]),
    { memoizeOptions: { resultEqualityCheck: shallowEqual } },
);

export const selectDisplayedNetworkSymbols = createMemoizedSelector(
    [
        (state: HomeAssetTableState) => selectSortedNetworkSymbols(state),
        selectCappedNetworkSymbols,
        selectRowLimit,
    ],
    (sorted, capped, rowLimit): readonly NetworkSymbol[] =>
        rowLimit === undefined ? sorted : capped,
);

// A network's rows are the secondary index's own list, which keeps its array while its members
// stand; a fold cuts it only while the network is over the budget the networks above it left.
export const selectDisplayedWalletAssetKeysOfNetwork = createMemoizedSelector(
    [
        (state: HomeAssetTableState, symbol: NetworkSymbol) =>
            displayedAssetsByNetwork.getIds(state, symbol),
        (state: HomeAssetTableState, symbol: NetworkSymbol, rowLimit?: number) =>
            selectCappedAssetKeysByNetwork(state, rowLimit).get(symbol)?.length ?? 0,
    ],
    (assetKeys, count): readonly WalletAssetKey[] =>
        count >= assetKeys.length ? assetKeys : returnStableArrayIfEmpty(assetKeys.slice(0, count)),
);

export const selectNetworkName = createMemoizedSelector(
    [selectNetworkNamesMap, (_state: HomeAssetTableState, symbol: NetworkSymbol) => symbol],
    (names, symbol) => names?.[symbol],
);

export const selectNetworkFiatValue = (state: HomeAssetTableState, symbol: NetworkSymbol) =>
    selectNetworkFiatValues(state).get(symbol)?.toFixed();

// --- One asset.

const selectAccountAssetsByKey = createMemoizedSelector(
    [
        (state: HomeAssetTableState, accountKey: AccountKey) =>
            pricedAssetsByAccount.getEntities(state, accountKey),
    ],
    (assets): ReadonlyMap<WalletAssetKey, PricedAsset> =>
        new Map(assets.map(asset => [asset.assetKey, asset])),
);

type Lookup<TAsset> = {
    shown: (state: HomeAssetTableState, assetKey: WalletAssetKey) => TAsset | undefined;
    hidden: (state: HomeAssetTableState, assetKey: WalletAssetKey) => TAsset | undefined;
};

const lookUp =
    <TAsset extends WalletAsset>({ shown, hidden }: Lookup<TAsset>) =>
    (
        state: HomeAssetTableState,
        assetKey: WalletAssetKey | undefined,
        isHidden = false,
        accountKey?: AccountKey,
    ): TAsset | PricedAsset | undefined => {
        if (assetKey === undefined) {
            return undefined;
        }

        if (accountKey !== undefined) {
            return selectAccountAssetsByKey(state, accountKey).get(assetKey);
        }

        return isHidden
            ? hidden(state, assetKey)
            : (shown(state, assetKey) ?? hidden(state, assetKey));
    };

// What an asset is needs no rate, so it is read before the assets are priced.
const selectWalletAsset = lookUp({ shown: assetsIndex.getById, hidden: hiddenAssetsIndex.getById });

const selectPricedWalletAsset = lookUp({
    shown: pricedAssetsIndex.getById,
    hidden: pricedHiddenAssetsIndex.getById,
});

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

const selectWalletAssetField =
    <TField extends keyof WalletAsset>(field: TField) =>
    (
        state: HomeAssetTableState,
        assetKey: WalletAssetKey | undefined,
        isHidden?: boolean,
        accountKey?: AccountKey,
    ) =>
        selectWalletAsset(state, assetKey, isHidden, accountKey)?.[field];

export const selectWalletAssetNetworkSymbol = selectWalletAssetField('networkSymbol');

export const selectWalletAssetContractAddress = selectWalletAssetField('contractAddress');

export const selectWalletAssetAmount = selectWalletAssetField('amount');

export const selectWalletAssetAccountCount = (
    state: HomeAssetTableState,
    assetKey: WalletAssetKey | undefined,
    isHidden?: boolean,
) => selectWalletAsset(state, assetKey, isHidden)?.accountCount ?? 0;

export const selectWalletAssetTokenSymbol = (
    state: HomeAssetTableState,
    assetKey: WalletAssetKey | undefined,
    isHidden?: boolean,
    accountKey?: AccountKey,
) => selectWalletAsset(state, assetKey, isHidden, accountKey)?.tokenSymbol ?? null;

export const selectWalletAssetTokenDecimals = selectWalletAssetField('tokenDecimals');

export const selectWalletAssetFiatValue = (
    state: HomeAssetTableState,
    assetKey: WalletAssetKey | undefined,
    accountKey?: AccountKey,
): BaseCurrencyAmount | undefined => {
    const asset = selectPricedWalletAsset(state, assetKey, false, accountKey);
    const fiatValue = asset !== undefined && 'fiatValue' in asset ? asset.fiatValue : undefined;

    return fiatValue === undefined ? undefined : asBaseCurrencyAmount(fiatValue);
};

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

// --- Staking.

const selectHomeAssetTableState = (state: HomeAssetTableState) => state;

const getAccountStakingAmount = (state: HomeAssetTableState, account: Account) =>
    selectCountedStakingPositionEntriesByAccount(state, account.key).reduce(
        (total, { position }) => total.plus(getStakingPositionAmount(position)),
        ZERO,
    );

export const selectWalletAssetStakingAmount = createMemoizedSelector(
    [
        selectHomeAssetTableState,
        selectVisibleDeviceAccounts,
        selectWalletAssetNetworkSymbol,
        selectWalletAssetContractAddress,
        (
            _state: HomeAssetTableState,
            _assetKey: WalletAssetKey | undefined,
            _isHidden?: boolean,
            accountKey?: AccountKey,
        ) => accountKey,
    ],
    (state, accounts, networkSymbol, contractAddress, accountKey): string => {
        if (networkSymbol === undefined || contractAddress !== undefined) {
            return '0';
        }

        const stakingAmount = accounts.reduce(
            (total, account) =>
                account.symbol === networkSymbol && (accountKey ?? account.key) === account.key
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

export const selectWalletAssetStakingRatio = createMemoizedSelector(
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

export const selectWalletAssetAvailableAmount = createMemoizedSelector(
    [selectWalletAssetAmount, selectWalletAssetStakingAmount],
    (totalAmount, stakingAmount) =>
        totalAmount === undefined
            ? undefined
            : new BigNumber(totalAmount).minus(stakingAmount).toFixed(),
);

// --- The tokens the table leaves out.

const haveSameGrouping = <Group>(
    left: ReadonlyMap<Group, readonly WalletAssetKey[]>,
    right: ReadonlyMap<Group, readonly WalletAssetKey[]>,
) =>
    left.size === right.size &&
    [...left].every(([group, assetKeys]) => shallowEqual(right.get(group), assetKeys));

const selectHiddenWalletAssetKeysByReason = createMemoizedSelector(
    [pricedHiddenAssetsIndex.getEntities, selectAllowedNetworkSymbols],
    (assets, allowedNetworks): ReadonlyMap<HiddenTokenReason, readonly WalletAssetKey[]> => {
        const byReason = new Map<HiddenTokenReason, WalletAssetKey[]>();

        assets.forEach(({ assetKey, networkSymbol, hiddenReason: reason }) => {
            if (reason !== undefined && allowedNetworks.includes(networkSymbol)) {
                byReason.set(reason, [...(byReason.get(reason) ?? []), assetKey]);
            }
        });

        return byReason;
    },
    // Rebuilt on every hidden balance write, so a rebuild that lands on the same lists is thrown
    // away and each group keeps the array it was handed; the per-reason selector stays unchecked.
    { memoizeOptions: { resultEqualityCheck: haveSameGrouping } },
);

export const selectHiddenWalletAssetKeys = createMemoizedSelector(
    [
        (state: HomeAssetTableState) => selectHiddenWalletAssetKeysByReason(state),
        (_state: HomeAssetTableState, reason: HiddenTokenReason) => reason,
    ],
    (byReason, reason): readonly WalletAssetKey[] =>
        returnStableArrayIfEmpty(byReason.get(reason) ?? []),
);

export const selectHiddenWalletAssetCount = createMemoizedSelector(
    [selectHiddenWalletAssetKeysByReason],
    byReason => [...byReason.values()].reduce((count, assetKeys) => count + assetKeys.length, 0),
);

export const selectHasHiddenWalletAssets = createMemoizedSelector(
    [selectHiddenWalletAssetKeysByReason],
    byReason => byReason.size > 0,
);

export const selectWalletAssetHiddenReason = (
    state: HomeAssetTableState,
    assetKey: WalletAssetKey | undefined,
): HiddenTokenReason | undefined => selectWalletAsset(state, assetKey)?.hiddenReason;

// --- The total over the table.

export type HomeAssetTotals = {
    /** Undefined while nothing the wallet holds can be priced; zero once it holds nothing at all. */
    fiatValue: BigNumber | undefined;
    weekChange: BigNumber | undefined;
    weekChangePercent: BigNumber | undefined;
};

const addUp = (values: readonly (BigNumber | undefined)[]) =>
    values.reduce<BigNumber>((total, value) => total.plus(worth(value)), ZERO);

export const selectHomeAssetTotals = createMemoizedSelector(
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

        const weekChange = addUp(comparable.map(asset => asset.fiatValue)).minus(weekAgoFiatValue);

        return { fiatValue, weekChange, weekChangePercent: weekChange.div(weekAgoFiatValue) };
    },
);
