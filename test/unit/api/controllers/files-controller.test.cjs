/**
 * @fileoverview Unit tests for files-controller (dependency-injected).
 */
// Use Jest's built-in expect
// const { expect } = require('chai');
// Using Jest's built-in mocking instead of sinon
const httpMocks = require('node-mocks-http');
const filesControllerFactory = require('../../../../src/api/controllers/files-controller');

function mockDeps(overrides = {}) {
    return {
        filesModule: {
            listFiles: jest.fn().mockResolvedValue([{ id: '1', name: 'file.txt' }]),
            uploadFile: jest.fn().mockResolvedValue({ uploaded: true })
        },
        ...overrides
    };
}

describe('files-controller', () => {
    it('should call listFiles and return files', async () => {
        const deps = mockDeps();
        const { listFiles } = filesControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'GET', query: {} });
        const res = httpMocks.createResponse();
        await listFiles(req, res);
        expect(deps.filesModule.listFiles).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res._getJSONData())).toBe(true);
    });

    it('should validate uploadFile input and return 400 on invalid', async () => {
        const deps = mockDeps();
        const { uploadFile } = filesControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'POST', body: { name: '', content: '' } });
        const res = httpMocks.createResponse();
        await uploadFile(req, res);
        expect(res.statusCode).toBe(400);
        expect(res._getJSONData()).toHaveProperty('error');
    });

    it('should call uploadFile and return result on valid input', async () => {
        const deps = mockDeps();
        const { uploadFile } = filesControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'POST', body: { name: 'file.txt', content: 'abc' } });
        const res = httpMocks.createResponse();
        await uploadFile(req, res);
        expect(deps.filesModule.uploadFile).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(res._getJSONData()).toHaveProperty('uploaded');
    });

    it('should handle internal errors and return 500', async () => {
        const deps = mockDeps({ filesModule: { uploadFile: jest.fn().mockRejectedValue(new Error('fail')) } });
        const { uploadFile } = filesControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'POST', body: { name: 'file.txt', content: 'abc' } });
        const res = httpMocks.createResponse();
        await uploadFile(req, res);
        expect(res.statusCode).toBe(500);
        expect(res._getJSONData()).toHaveProperty('error');
    });
});
