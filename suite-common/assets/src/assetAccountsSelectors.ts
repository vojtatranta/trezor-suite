import { type DeviceRootState } from '@suite-common/device';
import {
    type StakingRootState,
    selectStakingAmountsOutsideBalance,
} from '@suite-common/earn-staking';
import { type StakingAmount, stakingAmountSchema } from '@suite-common/earn-staking-common';
import {
    type TokenDefinitionsRootState,
    selectTokenDefinitions,
} from '@suite-common/token-definitions';
import { type TokenAddress } from '@suite-common/tokens';
import { type NetworkSymbol } from '@suite-common/wallet-config';
import {
    type AccountsRootState,
    type AssetAccountKey,
    type WalletAssetKey,
    getAssetAccountKey,
    getTokens,
    getWalletAssetKey,
    selectAccounts,
    selectVisibleDeviceAccounts,
} from '@suite-common/wallet-core';
import { type Account, type AccountKey } from '@suite-common/wallet-types';
import { getAccountBalanceWithStaking, isNftToken } from '@suite-common/wallet-utils';
import { type TokenInfo } from '@trezor/blockchain-link-types';
import { type StaticSessionId } from '@trezor/device-utils';
import {
    EMPTY_INDEX_ENTITIES,
    createAggregateIndex,
    createDerivedIndex,
    createIndex,
    createSecondaryIndex,
    createWeakMapSelector,
    returnStableArrayIfEmpty,
} from '@trezor/redux-utils';
import { BigNumber } from '@trezor/utils';

export type AssetAccount = {
    assetAccountKey: AssetAccountKey;
    accountKey: AccountKey;
    assetKey: WalletAssetKey;
    deviceState: StaticSessionId;
    networkSymbol: NetworkSymbol;
    contractAddress: TokenAddress | undefined;
    cryptoBalance: string;
    tokenInfo: TokenInfo | undefined;
    /** Why the Home table leaves this token out, if it does. */
    hiddenReason: HiddenTokenReason | undefined;
};

export type HiddenTokenReason = 'hiddenByUser' | 'unrecognized';

export type AssetAccountsRootState = AccountsRootState &
    DeviceRootState &
    TokenDefinitionsRootState &
    StakingRootState;

const createMemoizedSelector = createWeakMapSelector.withTypes<AssetAccountsRootState>();

const ZERO_STAKING_AMOUNT = stakingAmountSchema.parse('0');

type CoinDefinitions = Parameters<typeof getTokens>[0]['tokenDefinitions'];

const getHiddenReason = (
    token: TokenInfo,
    symbol: NetworkSymbol,
    coinDefinitions: CoinDefinitions,
): HiddenTokenReason | undefined => {
    const { hiddenWithBalance, unverifiedWithBalance } = getTokens({
        tokens: [token],
        symbol,
        tokenDefinitions: coinDefinitions,
    });

    if (hiddenWithBalance.length > 0) {
        return 'hiddenByUser';
    }

    return unverifiedWithBalance.length > 0 ? 'unrecognized' : undefined;
};

const toAssetAccounts = (
    account: Account,
    stakingAmountOutsideBalance: StakingAmount,
    coinDefinitions: CoinDefinitions,
): readonly AssetAccount[] => {
    const toAssetAccount = (
        contractAddress: TokenAddress | undefined,
        cryptoBalance: string,
        tokenInfo: TokenInfo | undefined,
    ): AssetAccount => ({
        assetAccountKey: getAssetAccountKey({ accountKey: account.key, contractAddress }),
        accountKey: account.key,
        assetKey: getWalletAssetKey({
            deviceState: account.deviceState,
            networkSymbol: account.symbol,
            contractAddress,
        }),
        deviceState: account.deviceState,
        networkSymbol: account.symbol,
        contractAddress,
        cryptoBalance,
        tokenInfo,
        hiddenReason:
            tokenInfo === undefined
                ? undefined
                : getHiddenReason(tokenInfo, account.symbol, coinDefinitions),
    });

    const tokenAccounts = (account.tokens ?? [])
        .filter(token => !isNftToken(token) && new BigNumber(token.balance ?? '0').gt(0))
        .map(token => toAssetAccount(token.contract as TokenAddress, token.balance ?? '0', token));

    return [
        toAssetAccount(
            undefined,
            getAccountBalanceWithStaking({ account, stakingBalance: stakingAmountOutsideBalance }),
            undefined,
        ),
        ...tokenAccounts,
    ];
};

type StakedAccount = { account: Account; stakingAmount: StakingAmount };

type NetworkCoinDefinitions = { symbol: string; coin: CoinDefinitions };

// Joined to each account, so definitions landing for one network re-read that network's accounts.
const coinDefinitionsIndex = createIndex({
    name: 'coinDefinitions',
    source: createMemoizedSelector([selectTokenDefinitions], definitions =>
        Object.entries(definitions ?? {}).map(([symbol, definition]): NetworkCoinDefinitions => ({
            symbol,
            coin: definition?.coin,
        })),
    ),
    getId: (definitions: NetworkCoinDefinitions) => definitions.symbol,
});

// An account and its staking amount are one entity, so a write to either re-expands that account
// alone, and an asset account equal to the one held keeps its object.
const createAssetAccountsIndex = (
    name: string,
    selectAccountsOf: (state: AssetAccountsRootState) => readonly Account[],
) => {
    const stakedAccountsIndex = createIndex({
        name: `${name}Accounts`,
        source: createMemoizedSelector(
            [selectAccountsOf, selectStakingAmountsOutsideBalance],
            (accounts, amounts): StakedAccount[] =>
                accounts.map(account => ({
                    account,
                    stakingAmount: amounts[account.key] ?? ZERO_STAKING_AMOUNT,
                })),
        ),
        getId: ({ account }: StakedAccount) => account.key,
    });

    return createAggregateIndex({
        name,
        source: createDerivedIndex({
            name: `${name}Holdings`,
            source: stakedAccountsIndex,
            join: { definitions: coinDefinitionsIndex },
            joinBy: ({ account }: StakedAccount) => ({ definitions: account.symbol }),
            toEntity: ({ account, stakingAmount }: StakedAccount, { definitions }) =>
                toAssetAccounts(account, stakingAmount, definitions?.coin),
        }),
        expand: (holdings: readonly AssetAccount[]) => holdings,
        getId: (assetAccount: AssetAccount) => assetAccount.assetAccountKey,
        reduce: (_held: AssetAccount | undefined, assetAccount: AssetAccount) => assetAccount,
    });
};

const assetAccountsIndex = createAssetAccountsIndex('assetAccounts', selectAccounts);

/** Only the wallet on screen: another wallet's accounts are no work this table has to do. */
const deviceAssetAccountsIndex = createAssetAccountsIndex(
    'deviceAssetAccounts',
    selectVisibleDeviceAccounts,
);

export const selectAssetAccounts = assetAccountsIndex.getEntities;

export const selectDeviceAssetAccounts = deviceAssetAccountsIndex.getEntities;

const deviceAssetAccountsByAsset = createSecondaryIndex({
    name: 'deviceAssetAccountsByAsset',
    source: deviceAssetAccountsIndex,
    getKeys: (assetAccount: AssetAccount) => assetAccount.assetKey,
});

/** The asset accounts of the wallet on screen holding one asset, in account order. */
export const selectDeviceAssetAccountsOfAsset = (
    state: AssetAccountsRootState,
    assetKey: WalletAssetKey | undefined,
): readonly AssetAccount[] =>
    assetKey === undefined
        ? EMPTY_INDEX_ENTITIES
        : deviceAssetAccountsByAsset.getEntities(state, assetKey);

export const selectHiddenAssetAccountKeys = createMemoizedSelector(
    [selectAssetAccounts],
    (assetAccounts): readonly AssetAccountKey[] =>
        returnStableArrayIfEmpty(
            assetAccounts
                .filter(assetAccount => assetAccount.hiddenReason !== undefined)
                .map(assetAccount => assetAccount.assetAccountKey),
        ),
);
