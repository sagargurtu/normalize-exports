/**
 * @returns `true` if `arr` is non-empty string array, `false` otherwise.
 */
export const isNonEmptyArray = (arr?: string[]): arr is string[] => Array.isArray(arr) && arr.length > 0;

/**
 * @returns `true` if `str` contains exactly one `*`, `false` otherwise.
 */
export const containsSingleAsterisk = (str: string): boolean => (str.match(/\*/g) || []).length === 1;
