export default {
    setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
    testEnvironment: 'jsdom',
    transform: {
        '^.+\\.js$': 'babel-jest'
    },
    moduleFileExtensions: ['js', 'json', 'node'],
};
