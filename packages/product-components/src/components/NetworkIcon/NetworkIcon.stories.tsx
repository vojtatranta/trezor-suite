import { type Meta, type StoryObj } from '@storybook/react';
import { Column, Grid, Paragraph } from '@trezor/components';

import { NetworkIcon, allowedNetworkIconSizes } from './NetworkIcon';

const meta: Meta<typeof NetworkIcon> = {
    title: 'NetworkIcon',
    component: NetworkIcon,
};
export default meta;

export const All: StoryObj = {
    render: () => (
        <Grid
            columns="repeat(auto-fit, minmax(120px, 1fr))"
            columnGap={16}
            rowGap={48}
            padding={{ vertical: 32 }}
        >
            {allowedNetworkIconSizes.map(size => (
                <Column key={size} justifyContent="center" alignItems="center" gap={12}>
                    <NetworkIcon networkSymbol="eth" size={size} />
                    <Paragraph intent="neutral" priority="secondary" isMonospaced>
                        {size}
                    </Paragraph>
                </Column>
            ))}
        </Grid>
    ),
};

export const Single: StoryObj<typeof NetworkIcon> = {
    args: {
        networkSymbol: 'eth',
        size: 64,
    },
    argTypes: {
        size: {
            options: allowedNetworkIconSizes,
            control: { type: 'select' },
        },
    },
};
