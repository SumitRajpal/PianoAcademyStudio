/** Shared constants with no heavy imports, so fast hooks can use them without loading TypeScript. */

export const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/;
export const NATIVE_EXT = /\.(?:swift|m|mm|h|hpp|hh|c|cc|cpp|cxx|kt|kts|java)$/;
export const THREADS = ['ui', 'js', 'audio', 'native', 'any'];
