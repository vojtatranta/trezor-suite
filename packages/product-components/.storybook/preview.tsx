import React from 'react';

import { ThemeProvider } from 'styled-components';

import { StoryContext, StoryFn } from '@storybook/react';
import { intermediaryTheme } from '@trezor/components';

import { NetworkDisplayProvider } from '../src/network-display/NetworkDisplayProvider';
import { storyNetworkConfigStore, storyServices } from '../src/components/TokenIcon/storyFixtures';

export const globalTypes = {
    mode: {
        defaultValue: 'light',
    },
};
export const decorators = [
    (Story: StoryFn, context: StoryContext) => {
        const mode = context.globals.mode ?? 'light';

        const theme =
            mode === 'light'
                ? { ...intermediaryTheme.light, variant: 'light' }
                : { ...intermediaryTheme.dark, variant: 'dark' };

        return (
            <NetworkDisplayProvider store={storyNetworkConfigStore} services={storyServices}>
                <ThemeProvider theme={theme}>
                    <div
                        style={{
                            padding: 32,
                            background: theme.surfaceFillPage,
                            color: theme.contentPrimary,
                            boxSizing: 'border-box',
                            height: '100vh',
                            overflow: 'auto',
                        }}
                    >
                        {Story(context.args, context)}
                    </div>
                </ThemeProvider>
            </NetworkDisplayProvider>
        );
    },
];

export const parameters = {
    layout: 'fullscreen',
    options: {
        showPanel: true,
        showInfo: true,
        panelPosition: 'right',
        storySort: {
            order: ['*'],
            method: 'alphabetical',
            locales: 'cs',
        },
    },
    theme: {
        base: 'light',
    },
};
