const filesModule = require('../../../src/modules/files');

describe('Files Module', () => {
    const mockGraphService = {
        listFiles: jest.fn(async (folderId) => [
            { id: '1', name: 'fileA.txt', size: 123 }
        ]),
        searchFiles: jest.fn(async (q) => [
            { id: '2', name: 'fileB.txt', size: 456 }
        ]),
        downloadFile: jest.fn(async (fileId) => Buffer.from('file-content')),
        uploadFile: jest.fn(async (name, content) => ({ id: '3', name })),
        getFileMetadata: jest.fn(async (fileId) => ({ id: fileId, name: 'fileMeta.txt', size: 789 })),
        createSharingLink: jest.fn(async (fileId, type) => ({ webUrl: 'https://share.example.com/file-1' })),
        getSharingLinks: jest.fn(async (fileId) => [{ webUrl: 'https://share.example.com/file-1' }]),
        removeSharingPermission: jest.fn(async (fileId, permissionId) => ({ success: true })),
        getFileContent: jest.fn(async (fileId) => Buffer.from('file-content')),
        setFileContent: jest.fn(async (fileId, content) => ({ id: fileId, name: 'set.txt' })),
        updateFileContent: jest.fn(async (fileId, content) => ({ id: fileId, name: 'update.txt' }))
    };
    const mockCacheService = {
        get: jest.fn(async () => undefined),
        set: jest.fn(async () => {})
    };
    let mod;
    beforeEach(() => {
        mod = filesModule.init({ graphService: mockGraphService, cacheService: mockCacheService });
    });
    it('handles listFiles intent', async () => {
        const res = await mod.handleIntent('listFiles', { folderId: null }, {});
        expect(res).toHaveProperty('type', 'fileList');
        expect(Array.isArray(res.items)).toBe(true);
        expect(res.items[0]).toHaveProperty('id', '1');
    });
    it('handles searchFiles intent', async () => {
        const res = await mod.handleIntent('searchFiles', { query: 'fileB' }, {});
        expect(res).toHaveProperty('type', 'fileList');
        expect(res.items[0]).toHaveProperty('id', '2');
    });
    it('handles downloadFile intent', async () => {
        const res = await mod.handleIntent('downloadFile', { fileId: '1' }, {});
        expect(res).toHaveProperty('type', 'fileDownload');
        expect(res).toHaveProperty('content');
    });
    it('handles uploadFile intent', async () => {
        const res = await mod.handleIntent('uploadFile', { name: 'foo.txt', content: Buffer.from('abc') }, {});
        expect(res).toHaveProperty('type', 'fileUploadResult');
        expect(res.file).toHaveProperty('id', '3');
    });
    it('handles getFileMetadata intent', async () => {
        const res = await mod.handleIntent('getFileMetadata', { fileId: '1' }, {});
        expect(res).toHaveProperty('type', 'fileMetadata');
        expect(res.file).toHaveProperty('id', '1');
    });
    it('handles createSharingLink intent', async () => {
        const res = await mod.handleIntent('createSharingLink', { fileId: '1', type: 'view' }, {});
        expect(res).toHaveProperty('type', 'sharingLink');
        expect(res.link).toHaveProperty('webUrl');
    });
    it('handles getSharingLinks intent', async () => {
        const res = await mod.handleIntent('getSharingLinks', { fileId: '1' }, {});
        expect(res).toHaveProperty('type', 'sharingLinks');
        expect(Array.isArray(res.links)).toBe(true);
    });
    it('handles removeSharingPermission intent', async () => {
        const res = await mod.handleIntent('removeSharingPermission', { fileId: '1', permissionId: 'perm-1' }, {});
        expect(res).toHaveProperty('type', 'removeSharingPermissionResult');
        expect(res.result).toHaveProperty('success', true);
    });
    it('handles getFileContent intent', async () => {
        const res = await mod.handleIntent('getFileContent', { fileId: '1' }, {});
        expect(res).toHaveProperty('type', 'fileContent');
        expect(res).toHaveProperty('content');
    });
    it('handles setFileContent intent', async () => {
        const res = await mod.handleIntent('setFileContent', { fileId: '1', content: Buffer.from('abc') }, {});
        expect(res).toHaveProperty('type', 'setFileContentResult');
        expect(res.file).toHaveProperty('id', '1');
    });
    it('handles updateFileContent intent', async () => {
        const res = await mod.handleIntent('updateFileContent', { fileId: '1', content: Buffer.from('abc') }, {});
        expect(res).toHaveProperty('type', 'updateFileContentResult');
        expect(res.file).toHaveProperty('id', '1');
    });
    it('throws on unknown intent', async () => {
        await expect(mod.handleIntent('unknownIntent')).rejects.toThrow(/cannot handle intent/);
    });
});
