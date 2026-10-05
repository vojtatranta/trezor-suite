import type { NetworkAssetsModule } from '@trezor/network-assets-types';
import type { CardanoAssetSymbol } from '@trezor/network-cardano-assets';
import type { CardanoNetworkSymbol } from '@trezor/network-cardano-types';
import type { NetworkIcon } from '@trezor/network-module-suite-common-types';

export type CardanoIconDeps = {
    cardanoAssets: NetworkAssetsModule<CardanoAssetSymbol>;
    parseAsset: (contract: string) => { policyId: string };
};

export const createCardanoIcon = (deps: CardanoIconDeps): NetworkIcon<CardanoNetworkSymbol> => ({
    getIcons: symbol => deps.cardanoAssets.getIcons(symbol),
    getTokenLogoIdentifiers: (_symbol, contract) => [
        deps.parseAsset(contract).policyId.toLowerCase(),
        contract,
    ],
});
