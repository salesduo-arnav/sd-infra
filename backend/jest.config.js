module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/**/*.test.ts'],
    verbose: true,
    forceExit: true,
    globalSetup: '<rootDir>/src/tests/global-setup.ts',
    globalTeardown: '<rootDir>/src/tests/global-teardown.ts',
    // clearMocks: true,
};