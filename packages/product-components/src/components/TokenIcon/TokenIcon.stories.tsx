import { type Meta, type StoryObj } from '@storybook/react';
import { getFramePropsStory } from '@trezor/components';

import { TokenIcon as TokenIconComponent } from './TokenIcon';
import {
    type TokenIconProps,
    allowedTokenIconFrameProps,
    allowedTokenIconSizes,
} from './tokenIconTypes';

const meta: Meta<TokenIconProps> = {
    title: 'TokenIcon',
    component: TokenIconComponent,
    argTypes: {
        ...getFramePropsStory(allowedTokenIconFrameProps).argTypes,
        symbol: { control: { type: 'text' } },
        contractAddress: { control: { type: 'text' } },
        size: {
            options: allowedTokenIconSizes,
            control: { type: 'select' },
        },
        showNetworkIcon: {
            control: { type: 'boolean' },
        },
        shouldTryToFetch: {
            control: { type: 'boolean' },
        },
        placeholder: {
            control: { type: 'text' },
        },
        placeholderWithTooltip: {
            control: { type: 'boolean' },
        },
        isBordered: {
            control: { type: 'boolean' },
        },
    },
};

export default meta;

export const NativeCoin: StoryObj<TokenIconProps> = {
    args: {
        size: 24,
        symbol: 'eth',
        placeholder: 'ETH',
        shouldTryToFetch: true,
        isBordered: true,
        ...getFramePropsStory(allowedTokenIconFrameProps).args,
    },
};

export const Token: StoryObj<TokenIconProps> = {
    args: {
        size: 24,
        symbol: 'eth',
        contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        placeholder: 'USDC',
        shouldTryToFetch: true,
        showNetworkIcon: true,
        isBordered: true,
        ...getFramePropsStory(allowedTokenIconFrameProps).args,
    },
};
