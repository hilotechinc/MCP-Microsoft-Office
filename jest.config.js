module.exports = {
    setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
    testEnvironment: 'node',
    transform: {
        '^.+\\.(js|cjs)$': 'babel-jest'
    },
    moduleFileExtensions: ['js', 'cjs', 'json', 'node'],
    testMatch: ['**/__tests__/**/*.(js|cjs)', '**/*.(test|spec).(js|cjs)']
};
