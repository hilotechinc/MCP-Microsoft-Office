const filesService = require('../../../src/graph/files-service');
const graphClientFactory = require('../../../src/graph/graph-client');

jest.mock('../../../src/graph/graph-client');

const MOCK_FILES = [
  {
    id: 'file-1',
    name: 'TestFile.txt',
    size: 1234,
    lastModifiedDateTime: '2025-04-22T10:00:00Z',
    file: {},
    folder: null,
    webUrl: 'https://example.com/file-1'
  },
  {
    id: 'folder-1',
    name: 'TestFolder',
    folder: {},
    file: null,
    webUrl: 'https://example.com/folder-1'
  }
];

describe('FilesService', () => {
  let client;
  beforeEach(() => {
    client = {
      api: jest.fn().mockReturnThis(),
      get: jest.fn(),
      put: jest.fn(),
      post: jest.fn(),
      patch: jest.fn()
    };
    graphClientFactory.createClient.mockResolvedValue(client);
  });

  it('should list files and folders in root', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockResolvedValue({ value: MOCK_FILES }) });
    const files = await filesService.listFiles();
    expect(Array.isArray(files)).toBe(true);
    expect(files[0]).toHaveProperty('id', 'file-1');
    expect(files[1]).toHaveProperty('id', 'folder-1');
  });

  it('should list files in a folder', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockResolvedValue({ value: MOCK_FILES }) });
    const files = await filesService.listFiles('folder-1');
    expect(files[0]).toHaveProperty('id', 'file-1');
  });

  it('should search files by name', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockResolvedValue({ value: MOCK_FILES }) });
    const files = await filesService.searchFiles('TestFile');
    expect(files[0].name).toMatch(/TestFile/i);
  });

  it('should download a file', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockResolvedValue(Buffer.from('file-content')) });
    const content = await filesService.downloadFile('file-1');
    expect(content).toBeInstanceOf(Buffer);
  });

  it('should upload a file', async () => {
    client.api.mockReturnValue({ put: jest.fn().mockResolvedValue({ id: 'file-2', name: 'Uploaded.txt' }) });
    const result = await filesService.uploadFile('Uploaded.txt', Buffer.from('data'));
    expect(result).toHaveProperty('id', 'file-2');
  });

  it('should retrieve file metadata by ID', async () => {
    const fileMeta = {
      id: 'file-1',
      name: 'TestFile.txt',
      size: 1234,
      lastModifiedDateTime: '2025-04-22T10:00:00Z',
      file: {},
      folder: null,
      webUrl: 'https://example.com/file-1'
    };
    client.api.mockReturnValue({ get: jest.fn().mockResolvedValue(fileMeta) });
    const meta = await filesService.getFileMetadata('file-1');
    expect(meta).toHaveProperty('id', 'file-1');
    expect(meta).toHaveProperty('name', 'TestFile.txt');
    expect(meta).toHaveProperty('webUrl');
  });

  it('should handle throttling on metadata retrieval', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockRejectedValue(new Error('Graph API throttled (429)')) });
    await expect(filesService.getFileMetadata('file-1')).rejects.toThrow(/429/);
  });

  it('should create a sharing link', async () => {
    const sharingLink = { link: { webUrl: 'https://share.example.com/file-1' } };
    client.api.mockReturnValue({ post: jest.fn().mockResolvedValue(sharingLink) });
    const result = await filesService.createSharingLink('file-1', 'view');
    expect(result).toHaveProperty('webUrl');
  });

  it('should get sharing links for a file', async () => {
    const permissions = { value: [
      { id: 'perm-1', link: { webUrl: 'https://share.example.com/file-1' } }
    ] };
    client.api.mockReturnValue({ get: jest.fn().mockResolvedValue(permissions) });
    const links = await filesService.getSharingLinks('file-1');
    expect(Array.isArray(links)).toBe(true);
    expect(links[0]).toHaveProperty('webUrl');
  });

  it('should remove a sharing link/permission', async () => {
    client.api.mockReturnValue({ delete: jest.fn().mockResolvedValue({}) });
    const result = await filesService.removeSharingPermission('file-1', 'perm-1');
    expect(result).toEqual({});
  });

  it('should handle throttling on sharing link creation', async () => {
    client.api.mockReturnValue({ post: jest.fn().mockRejectedValue(new Error('Graph API throttled (429)')) });
    await expect(filesService.createSharingLink('file-1', 'view')).rejects.toThrow(/429/);
  });

  it('should get file content (download)', async () => {
    const content = Buffer.from('file-content');
    client.api.mockReturnValue({ get: jest.fn().mockResolvedValue(content) });
    const result = await filesService.getFileContent('file-1');
    expect(result).toBeInstanceOf(Buffer);
  });

  it('should set (overwrite) file content', async () => {
    client.api.mockReturnValue({ put: jest.fn().mockResolvedValue({ id: 'file-1', name: 'TestFile.txt' }) });
    const result = await filesService.setFileContent('file-1', Buffer.from('new-content'));
    expect(result).toHaveProperty('id', 'file-1');
  });

  it('should update (patch) file content', async () => {
    client.api.mockReturnValue({ patch: jest.fn().mockResolvedValue({ id: 'file-1', name: 'TestFile.txt' }) });
    const result = await filesService.updateFileContent('file-1', Buffer.from('patch-content'));
    expect(result).toHaveProperty('id', 'file-1');
  });

  it('should handle throttling on file content operations', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockRejectedValue(new Error('Graph API throttled (429)')) });
    await expect(filesService.getFileContent('file-1')).rejects.toThrow(/429/);
  });

  it('should handle throttling errors gracefully', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockRejectedValue(new Error('Graph API throttled (429)')) });
    await expect(filesService.listFiles()).rejects.toThrow(/429/);
  });
});
