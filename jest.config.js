/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
    '^.+\\.js$': ['ts-jest', { tsconfig: { jsx: 'react', allowJs: true } }],
  },
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)', '**/__tests__/**/*.spec.(ts|tsx|js)'],
  clearMocks: true,
};
