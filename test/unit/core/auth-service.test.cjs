const authService = require('../../../src/core/auth-service');
const storageService = require('../../../src/core/storage-service');

jest.mock('../../../src/core/storage-service');

const TEST_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOi...';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('AuthService', () => {
    it('should store and retrieve a token securely', async () => {
        storageService.setSecure.mockResolvedValue();
        storageService.getSecure.mockResolvedValue(TEST_TOKEN);
        await authService.setToken(TEST_TOKEN);
        const token = await authService.getToken();
        expect(token).toBe(TEST_TOKEN);
        expect(storageService.setSecure).toHaveBeenCalledWith('auth-token', TEST_TOKEN);
        expect(storageService.getSecure).toHaveBeenCalledWith('auth-token');
    });

    it('should return false for isAuthenticated if no token', async () => {
        storageService.getSecure.mockResolvedValue(null);
        const result = await authService.isAuthenticated();
        expect(result).toBe(false);
    });

    it('should return true for isAuthenticated if token exists', async () => {
        storageService.getSecure.mockResolvedValue(TEST_TOKEN);
        const result = await authService.isAuthenticated();
        expect(result).toBe(true);
    });

    it('should clear the token on logout', async () => {
        storageService.setSecure.mockResolvedValue();
        await authService.clearToken();
        expect(storageService.setSecure).toHaveBeenCalledWith('auth-token', '');
    });

    it('should throw if token is invalid', async () => {
        await expect(authService.setToken(undefined)).rejects.toThrow();
        await expect(authService.setToken('')).rejects.toThrow();
    });
});
