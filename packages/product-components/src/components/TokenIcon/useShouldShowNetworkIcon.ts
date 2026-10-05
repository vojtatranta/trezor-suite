import { useServices } from '../../services/ServicesProvider';

export const useShouldShowNetworkIcon = () => {
    const deps = useServices();

    return (symbol?: string, contractAddress?: string | null) =>
        !!symbol && !!contractAddress && !!deps.getNetworkIcon(symbol)?.supportsTokens;
};
