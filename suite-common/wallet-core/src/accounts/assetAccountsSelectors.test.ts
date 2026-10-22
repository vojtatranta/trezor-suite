import { asNetworkSymbol } from '@suite-common/wallet-config';
import { type TokenAddress } from '@suite-common/wallet-types';
import { type StaticSessionId } from '@trezor/device-utils';

import { getWalletAssetKey } from './assetAccountsSelectors';

const ALICE = 'aliceWallet@device:0' as StaticSessionId;
const USDC_ON_ETH = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as TokenAddress;

describe('getWalletAssetKey', () => {
    it('is the wallet, the network and the contract', () => {
        expect(
            getWalletAssetKey({
                deviceState: ALICE,
                symbol: asNetworkSymbol('eth'),
                contractAddress: USDC_ON_ETH,
            }),
        ).toBe(`${ALICE}/eth/${USDC_ON_ETH}`);
    });

    it('is the wallet and the network alone for the network coin', () => {
        expect(getWalletAssetKey({ deviceState: ALICE, symbol: asNetworkSymbol('btc') })).toBe(
            `${ALICE}/btc/`,
        );
    });
});
