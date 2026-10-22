import { shallowEqual } from 'react-redux';

import { type DeviceRootState, selectDeviceStaticSessionId } from '@suite-common/device';
import { type NetworksRootState, selectNetworkNamesMap } from '@suite-common/networks';
import { selectTokenDefinitions } from '@suite-common/token-definitions';
import { type NetworkSymbol, getAssetName, getDisplaySymbol } from '@suite-common/wallet-config';
import {
    type AssetAccountsRootState,
    type FiatRatesRootState,
    type HiddenTokenReason,
    type WalletAssetKey,
    type WalletSettingsRootState,
    getTokens,
    getWalletAssetKey,
    selectAreHomeAssetSmallBalancesShown,
    selectBaseCurrency,
    selectCurrentFiatRates,
    selectEnabledNetworks,
    selectLastWeekFiatRates,
    selectVisibleDeviceAccounts,
} from '@suite-common/wallet-core';
import {
    type Account,
    type BaseCurrencyAmount,
    type TokenAddress,
    type TokenSymbol,
    areBaseCurrencyAmountsEqual,
    asBaseCurrencyAmount,
    toTokenSymbol,
} from '@suite-common/wallet-types';
import {
    getAccountTotalStakingBalance,
    isPositiveBalance,
    toFiatCurrency,
} from '@suite-common/wallet-utils';
import { type TokenInfo } from '@trezor/blockchain-link-types';
import {
    createAggregateIndex,
    createDerivedIndex,
    createIndex,
    createSecondaryIndex,
    createWeakMapSelector,
    returnStableArrayIfEmpty,
} from '@trezor/redux-utils';
import { BigNumber } from '@trezor/utils';

export type HomeAssetTableState = AssetAccountsRootState &
    DeviceRootState &
    NetworksRootState &
    FiatRatesRootState &
    WalletSettingsRootState;

const createMemoizedSelector = createWeakMapSelector.withTypes<HomeAssetTableState>();

const ZERO = new BigNumber(0);

const worth = (fiatValue: BigNumber | undefined) => fiatValue ?? ZERO;

/** Shallow equality, except that two values are the same number rather than the same object. */
const haveSameValues = <TEntity extends object>(previous: TEntity, next: TEntity) =>
    Object.keys(previous).length === Object.keys(next).length &&
    Object.keys(next).every(field => {
        const left = previous[field as keyof TEntity];
        const right = next[field as keyof TEntity];

        return left instanceof BigNumber && right instanceof BigNumber
            ? left.eq(right)
            : left === right;
    });

// The accounts of the wallet on screen, on the networks the user enabled.

const selectShownAccounts = createMemoizedSelector(
    [selectVisibleDeviceAccounts, selectEnabledNetworks],
    (accounts, enabledNetworks) =>
        returnStableArrayIfEmpty(
            accounts.filter(account => enabledNetworks.includes(account.symbol)),
        ),
);

const accountsIndex = createIndex({
    name: 'homeAssetAccounts',
    source: selectShownAccounts,
    getId: (account: Account) => account.key,
});

// What vouches for a token, per network: joined to each account, so a definition landing for one
// network re-reads the accounts of that network only.

type CoinDefinitions = Parameters<typeof getTokens>[0]['tokenDefinitions'];

type NetworkCoinDefinitions = { symbol: NetworkSymbol; coin: CoinDefinitions };

const selectNetworkCoinDefinitions = createMemoizedSelector(
    [selectTokenDefinitions],
    (definitions): NetworkCoinDefinitions[] =>
        Object.entries(definitions ?? {}).map(([symbol, definition]) => ({
            symbol: symbol as NetworkSymbol,
            coin: definition?.coin,
        })),
);

const coinDefinitionsIndex = createIndex({
    name: 'homeAssetCoinDefinitions',
    source: selectNetworkCoinDefinitions,
    getId: (definitions: NetworkCoinDefinitions) => definitions.symbol,
});

// What an account holds: its coin, staked balance included, and every token with a balance, each
// with the reason the table leaves it out, if it does.

type Position = {
    assetKey: WalletAssetKey;
    symbol: NetworkSymbol;
    contractAddress: TokenAddress | undefined;
    balance: string;
    tokenInfo: TokenInfo | undefined;
    hiddenReason: HiddenTokenReason | undefined;
};

const getCoinBalance = (account: Account) => {
    // Cardano stakes the balance itself, so adding its stake would count the coin twice.
    const stakingBalance =
        account.networkType === 'cardano' ? null : getAccountTotalStakingBalance(account);

    return stakingBalance
        ? new BigNumber(account.formattedBalance).plus(stakingBalance).toFixed()
        : account.formattedBalance;
};

const toPositions = (account: Account, coinDefinitions: CoinDefinitions): Position[] => {
    const { deviceState, symbol } = account;
    const { shownWithBalance, hiddenWithBalance, unverifiedWithBalance } = getTokens({
        tokens: account.tokens ?? [],
        symbol,
        tokenDefinitions: coinDefinitions,
    });

    const toTokenPositions = (tokens: TokenInfo[], hiddenReason?: HiddenTokenReason) =>
        tokens.map((token): Position => {
            const contractAddress = token.contract as TokenAddress;

            return {
                assetKey: getWalletAssetKey({ deviceState, symbol, contractAddress }),
                symbol,
                contractAddress,
                balance: token.balance ?? '0',
                tokenInfo: token,
                hiddenReason,
            };
        });

    return [
        {
            assetKey: getWalletAssetKey({ deviceState, symbol }),
            symbol,
            contractAddress: undefined,
            balance: getCoinBalance(account),
            tokenInfo: undefined,
            hiddenReason: undefined,
        },
        ...toTokenPositions(shownWithBalance),
        ...toTokenPositions(hiddenWithBalance, 'hiddenByUser'),
        ...toTokenPositions(unverifiedWithBalance, 'unrecognized'),
    ];
};

const positionsIndex = createDerivedIndex({
    name: 'homeAssetPositions',
    source: accountsIndex,
    join: { definitions: coinDefinitionsIndex },
    joinBy: (account: Account) => ({ definitions: account.symbol }),
    toEntity: (account: Account, { definitions }) => toPositions(account, definitions?.coin),
});

// The positions folded into the assets of the wallet, one per coin or token: the shown ones and
// the ones the table leaves out, apart.

type WalletAsset = {
    assetKey: WalletAssetKey;
    symbol: NetworkSymbol;
    contractAddress: TokenAddress | undefined;
    amount: string;
    displaySymbol: string;
    name: string;
    tokenSymbol: TokenSymbol | null;
    tokenDecimals: number | undefined;
    accountCount: number;
    hiddenReason: HiddenTokenReason | undefined;
};

const toAsset = ({
    assetKey,
    symbol,
    contractAddress,
    tokenInfo,
    hiddenReason,
}: Position): Omit<WalletAsset, 'amount' | 'accountCount'> => ({
    assetKey,
    symbol,
    contractAddress,
    displaySymbol: getDisplaySymbol(tokenInfo?.symbol ?? symbol, contractAddress),
    name: getAssetName({ symbol, tokenName: tokenInfo?.name, tokenSymbol: tokenInfo?.symbol }),
    tokenSymbol: tokenInfo?.symbol === undefined ? null : toTokenSymbol(tokenInfo.symbol),
    tokenDecimals: tokenInfo?.decimals,
    hiddenReason,
});

const addPosition = (asset: WalletAsset | undefined, position: Position): WalletAsset => ({
    ...(asset ?? toAsset(position)),
    amount: new BigNumber(asset?.amount ?? 0).plus(position.balance).toFixed(),
    accountCount: (asset?.accountCount ?? 0) + (isPositiveBalance(position.balance) ? 1 : 0),
});

const createAssetsIndex = (name: string, isHidden: boolean) =>
    createAggregateIndex({
        name,
        source: positionsIndex,
        expand: (positions: Position[]) => positions,
        getId: (position: Position) =>
            (position.hiddenReason !== undefined) === isHidden ? position.assetKey : undefined,
        reduce: addPosition,
    });

const assetsIndex = createAssetsIndex('homeAssets', false);
const hiddenAssetsIndex = createAssetsIndex('homeHiddenAssets', true);

// The rates in the base currency, by the asset they price: its symbol, or its symbol and token
// contract. A rate is an entity, so rates replaced with the same numbers change nothing and a rate
// that moved reaches only the assets it prices.

type RateEntry = { key: string; rate: number | undefined; usdRate: number | undefined };

const toRateKey = (symbol: NetworkSymbol, contractAddress: TokenAddress | undefined) =>
    contractAddress === undefined ? symbol : `${symbol}-${contractAddress}`;

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

const currentRatesIndex = createIndex({
    name: 'homeAssetCurrentRates',
    source: createMemoizedSelector([selectCurrentFiatRates, selectBaseCurrency], toRateEntries),
    getId: (entry: RateEntry) => entry.key,
});

const lastWeekRatesIndex = createIndex({
    name: 'homeAssetLastWeekRates',
    source: createMemoizedSelector([selectLastWeekFiatRates, selectBaseCurrency], toRateEntries),
    getId: (entry: RateEntry) => entry.key,
});

// The assets priced, the most valuable first. What nothing can price goes below everything that
// can, even below what is worth zero.

type PricedAsset = WalletAsset & {
    fiatValue: BaseCurrencyAmount | undefined;
    weekAgoFiatValue: BaseCurrencyAmount | undefined;
    /** What a dollar is in the base currency, by this asset's rate; see `selectUsdToBaseCurrencyRate`. */
    usdToBaseCurrencyRate: number | undefined;
};

const price = (amount: string, entry: RateEntry | undefined) =>
    toFiatCurrency({ amount, rate: entry?.rate }) ?? undefined;

const byValue = (left: PricedAsset, right: PricedAsset) => {
    const isPriced = (asset: PricedAsset) => asset.fiatValue !== undefined;

    if (isPriced(left) !== isPriced(right)) {
        return isPriced(left) ? -1 : 1;
    }

    // `comparedTo` is typed to answer null for a NaN side, which `toFiatCurrency` rules out.
    return worth(right.fiatValue).comparedTo(worth(left.fiatValue)) ?? 0;
};

const byValueThenAmount = (left: PricedAsset, right: PricedAsset) =>
    byValue(left, right) || (new BigNumber(right.amount).comparedTo(left.amount) ?? 0);

const pricedAssetsIndex = createDerivedIndex({
    name: 'homeAssetsPriced',
    source: assetsIndex,
    join: { rate: currentRatesIndex, weekAgoRate: lastWeekRatesIndex },
    joinBy: (asset: WalletAsset) => {
        const rateKey = toRateKey(asset.symbol, asset.contractAddress);

        return { rate: rateKey, weekAgoRate: rateKey };
    },
    toEntity: (asset: WalletAsset, { rate, weekAgoRate }): PricedAsset => ({
        ...asset,
        fiatValue: price(asset.amount, rate),
        weekAgoFiatValue: price(asset.amount, weekAgoRate),
        usdToBaseCurrencyRate: rate?.rate && rate.usdRate ? rate.rate / rate.usdRate : undefined,
    }),
    sort: byValue,
    isEqual: haveSameValues,
});

const pricedHiddenAssetsIndex = createDerivedIndex({
    name: 'homeHiddenAssetsPriced',
    source: hiddenAssetsIndex,
    join: { rate: currentRatesIndex },
    joinBy: (asset: WalletAsset) => ({ rate: toRateKey(asset.symbol, asset.contractAddress) }),
    toEntity: (asset: WalletAsset, { rate }): PricedAsset => ({
        ...asset,
        fiatValue: price(asset.amount, rate),
        weekAgoFiatValue: undefined,
        usdToBaseCurrencyRate: undefined,
    }),
    sort: byValueThenAmount,
    isEqual: haveSameValues,
});

const hiddenAssetsByReason = createSecondaryIndex({
    name: 'homeHiddenAssetsByReason',
    source: pricedHiddenAssetsIndex,
    getKeys: (asset: PricedAsset) => asset.hiddenReason,
});

// What each network is worth. A network nothing can price — a testnet, or rates that have yet to
// land — is worth nothing it can say: a total of zero would be a lie.

type NetworkWorth = { symbol: NetworkSymbol; fiatValue: BigNumber | undefined };

const networksIndex = createAggregateIndex({
    name: 'homeAssetNetworks',
    source: pricedAssetsIndex,
    expand: (asset: PricedAsset) => [asset],
    getId: (asset: PricedAsset) => asset.symbol,
    reduce: (network: NetworkWorth | undefined, asset: PricedAsset): NetworkWorth => ({
        symbol: asset.symbol,
        fiatValue:
            asset.fiatValue === undefined
                ? network?.fiatValue
                : worth(network?.fiatValue).plus(asset.fiatValue),
    }),
    isEqual: haveSameValues,
});

// --- The rows the wallet holds.

export const selectShownWalletAssetKeys = pricedAssetsIndex.getIds;

/** Whether there is anything to draw at all: a boolean, so a reorder of the rows is no re-render. */
export const selectHasShownWalletAssets = (state: HomeAssetTableState) =>
    selectShownWalletAssetKeys(state).length > 0;

// --- Small balances.

const SMALL_BALANCE_USD_VALUE = new BigNumber(1);

/**
 * What a dollar is in the chosen currency, as one plain number. Every current rate carries its dollar
 * rate (see `CurrentFiatRatesResult`) and a provider prices everything through one exchange-rate
 * table, so `rate / usdRate` is the same for every asset it holds — one asset's pair is enough. The
 * most valuable priced asset is asked first: its rates are the ones most watched.
 */
const selectUsdToBaseCurrencyRate = createMemoizedSelector(
    [pricedAssetsIndex.getEntities, selectBaseCurrency],
    (assets, baseCurrencyCode): number | undefined =>
        baseCurrencyCode === 'usd'
            ? 1
            : assets.find(asset => asset.usdToBaseCurrencyRate !== undefined)
                  ?.usdToBaseCurrencyRate,
);

/**
 * Under a dollar, whatever currency is chosen. An asset nothing can price has no value to be under
 * it, so it is not small: it stays, sorted below the priced ones. Neither is a coin with nothing on
 * it: an empty account is the network the user enabled, not a leftover. Until the dollar can be
 * converted nothing is small, which is safe: small balances are shown by default.
 */
const selectSmallBalanceAssets = createMemoizedSelector(
    [pricedAssetsIndex.getEntities, selectUsdToBaseCurrencyRate],
    (assets, usdToBaseCurrencyRate): readonly PricedAsset[] => {
        if (usdToBaseCurrencyRate === undefined) {
            return returnStableArrayIfEmpty([]);
        }

        const threshold = SMALL_BALANCE_USD_VALUE.times(usdToBaseCurrencyRate);

        return returnStableArrayIfEmpty(
            assets.filter(
                asset =>
                    (asset.contractAddress !== undefined || isPositiveBalance(asset.amount)) &&
                    asset.fiatValue?.lt(threshold),
            ),
        );
    },
);

export type SmallBalanceSummary = {
    assetCount: number;
    fiatValue: BigNumber;
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
);

// --- The rows the table draws: what the small-balance switch leaves, by network.

const displayedAssetsIndex = createIndex({
    name: 'homeDisplayedAssets',
    source: createMemoizedSelector(
        [
            pricedAssetsIndex.getEntities,
            selectSmallBalanceAssets,
            selectAreHomeAssetSmallBalancesShown,
        ],
        (assets, small, areSmallBalancesShown) =>
            areSmallBalancesShown ? assets : assets.filter(asset => !small.includes(asset)),
    ),
    getId: (asset: PricedAsset) => asset.assetKey,
});

const displayedAssetsByNetwork = createSecondaryIndex({
    name: 'homeDisplayedAssetsByNetwork',
    source: displayedAssetsIndex,
    getKeys: (asset: PricedAsset) => asset.symbol,
});

/** How many rows the table may show before it folds, `HOME_ASSET_ROW_LIMIT` on both platforms. */
const selectRowLimit = (_state: HomeAssetTableState, rowLimit?: number) => rowLimit;

const takeFirst = <TItem>(items: readonly TItem[], count: number | undefined) =>
    count === undefined || count >= items.length
        ? items
        : returnStableArrayIfEmpty(items.slice(0, Math.max(count, 0)));

/** Whether the table has more to show than the limit allows: a boolean, so a reorder below it is no re-render. */
export const selectIsHomeAssetTableFoldable = (state: HomeAssetTableState, rowLimit?: number) =>
    rowLimit !== undefined && displayedAssetsIndex.getIds(state).length > rowLimit;

/** The rows to draw, cut to `rowLimit` while the table is folded; every row when none is given. */
export const selectDisplayedWalletAssetKeys = createMemoizedSelector(
    [displayedAssetsIndex.getIds, selectRowLimit],
    takeFirst,
);

export type HomeAssetGrouping = 'default' | 'networks';

/** The networks the drawn rows are held on, the most valuable network first. */
const selectSortedNetworkSymbols = createMemoizedSelector(
    [displayedAssetsIndex.getEntities, networksIndex.read],
    (assets, networks): readonly NetworkSymbol[] =>
        returnStableArrayIfEmpty(
            [...new Set(assets.map(asset => asset.symbol))].sort(
                (left, right) =>
                    worth(networks.byId.get(right)?.fiatValue).comparedTo(
                        worth(networks.byId.get(left)?.fiatValue),
                    ) ?? 0,
            ),
        ),
    { memoizeOptions: { resultEqualityCheck: shallowEqual } },
);

const selectNetworkRowCounts = createMemoizedSelector(
    [displayedAssetsIndex.getEntities],
    (assets): ReadonlyMap<NetworkSymbol, number> => {
        const counts = new Map<NetworkSymbol, number>();

        assets.forEach(({ symbol }) => counts.set(symbol, (counts.get(symbol) ?? 0) + 1));

        return counts;
    },
);

/** How many rows the fold leaves each network: what the networks above it have not taken. */
const selectNetworkRowBudgets = createMemoizedSelector(
    [selectSortedNetworkSymbols, selectNetworkRowCounts, selectRowLimit],
    (symbols, counts, rowLimit): ReadonlyMap<NetworkSymbol, number> | undefined => {
        if (rowLimit === undefined) {
            return undefined;
        }

        let budget = rowLimit;

        return new Map(
            symbols.map(symbol => {
                const own = budget;
                budget = Math.max(budget - (counts.get(symbol) ?? 0), 0);

                return [symbol, own];
            }),
        );
    },
);

export const selectDisplayedNetworkSymbols = createMemoizedSelector(
    [selectSortedNetworkSymbols, selectNetworkRowBudgets],
    (symbols, budgets): readonly NetworkSymbol[] =>
        budgets === undefined
            ? symbols
            : returnStableArrayIfEmpty(symbols.filter(symbol => budgets.get(symbol) !== 0)),
    { memoizeOptions: { resultEqualityCheck: shallowEqual } },
);

export const selectDisplayedWalletAssetKeysOfNetwork = createMemoizedSelector(
    [
        (state: HomeAssetTableState, symbol: NetworkSymbol) =>
            displayedAssetsByNetwork.getIds(state, symbol),
        (state: HomeAssetTableState, symbol: NetworkSymbol, rowLimit?: number) =>
            selectNetworkRowBudgets(state, rowLimit)?.get(symbol),
    ],
    takeFirst,
);

export const selectNetworkName = createMemoizedSelector(
    [selectNetworkNamesMap, (_state: HomeAssetTableState, symbol: NetworkSymbol) => symbol],
    (names, symbol) => names?.[symbol],
);

export const selectNetworkFiatValue = (state: HomeAssetTableState, symbol: NetworkSymbol) =>
    networksIndex.getById(state, symbol)?.fiatValue?.toFixed();

// --- One asset.

const selectWalletAsset = (
    state: HomeAssetTableState,
    assetKey: WalletAssetKey | undefined,
    isHidden = false,
) =>
    assetKey === undefined
        ? undefined
        : (isHidden ? pricedHiddenAssetsIndex : pricedAssetsIndex).getById(state, assetKey);

const selectWalletAssetField =
    <TField extends keyof PricedAsset>(field: TField) =>
    (state: HomeAssetTableState, assetKey: WalletAssetKey | undefined, isHidden?: boolean) =>
        selectWalletAsset(state, assetKey, isHidden)?.[field];

export const selectWalletAssetSymbol = selectWalletAssetField('symbol');
export const selectWalletAssetContractAddress = selectWalletAssetField('contractAddress');
export const selectWalletAssetDisplaySymbol = selectWalletAssetField('displaySymbol');
export const selectWalletAssetAmount = selectWalletAssetField('amount');
export const selectWalletAssetTokenDecimals = selectWalletAssetField('tokenDecimals');

export const selectWalletAssetTokenSymbol = (
    state: HomeAssetTableState,
    assetKey: WalletAssetKey | undefined,
    isHidden?: boolean,
) => selectWalletAsset(state, assetKey, isHidden)?.tokenSymbol ?? null;

export const selectWalletAssetAccountCount = (
    state: HomeAssetTableState,
    assetKey: WalletAssetKey | undefined,
    isHidden?: boolean,
) => selectWalletAsset(state, assetKey, isHidden)?.accountCount ?? 0;

export const selectWalletAssetFiatValue = (
    state: HomeAssetTableState,
    assetKey: WalletAssetKey | undefined,
) => {
    const fiatValue = selectWalletAsset(state, assetKey)?.fiatValue;

    return fiatValue === undefined ? undefined : asBaseCurrencyAmount(fiatValue);
};

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
                  symbol: networkSymbol,
                  contractAddress: tokenContract,
              }),
);

export const selectWalletAssetStakingAmount = createMemoizedSelector(
    [selectVisibleDeviceAccounts, selectWalletAssetSymbol, selectWalletAssetContractAddress],
    (accounts, networkSymbol, contractAddress) => {
        // Cardano delegates the spendable account balance itself, so it cannot be split into
        // separate available and staked amounts like the other staking networks.
        if (
            networkSymbol === undefined ||
            networkSymbol === 'ada' ||
            contractAddress !== undefined
        ) {
            return '0';
        }

        return accounts
            .reduce(
                (total, account) =>
                    account.symbol === networkSymbol
                        ? total.plus(getAccountTotalStakingBalance(account) ?? 0)
                        : total,
                new BigNumber(0),
            )
            .toFixed();
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

export const selectHiddenWalletAssetKeys = (
    state: HomeAssetTableState,
    reason: HiddenTokenReason,
) => hiddenAssetsByReason.getIds(state, reason);

export const selectHasHiddenWalletAssets = (state: HomeAssetTableState) =>
    hiddenAssetsByReason.getKeys(state).length > 0;

// --- The total over the wallet.

export type HomeAssetTotals = {
    /** Undefined while nothing the wallet holds can be priced — a total of zero would be a lie. */
    fiatValue: BigNumber | undefined;
    weekChange: BigNumber | undefined;
    weekChangePercent: BigNumber | undefined;
};

const addUp = (values: readonly (BigNumber | undefined)[]) =>
    values.reduce<BigNumber>((total, value) => total.plus(worth(value)), ZERO);

export const selectHomeAssetTotals = createMemoizedSelector(
    [pricedAssetsIndex.getEntities],
    (assets): HomeAssetTotals => {
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

export const selectHomeAssetTotalFiatValue = createMemoizedSelector(
    [selectHomeAssetTotals],
    ({ fiatValue }): BaseCurrencyAmount | undefined =>
        fiatValue === undefined ? undefined : asBaseCurrencyAmount(fiatValue),
    { memoizeOptions: { resultEqualityCheck: areBaseCurrencyAmountsEqual } },
);
