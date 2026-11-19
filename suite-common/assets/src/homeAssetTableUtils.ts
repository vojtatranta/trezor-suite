/** How many rows the Home asset table shows before it folds, on desktop and mobile alike. */
export const HOME_ASSET_ROW_LIMIT = 8;

type GetHomeAssetRowLimitParams = {
    isFoldable: boolean;
    isExpanded: boolean;
};

export const getHomeAssetRowLimit = ({ isFoldable, isExpanded }: GetHomeAssetRowLimitParams) =>
    isFoldable && !isExpanded ? HOME_ASSET_ROW_LIMIT : undefined;
