/**
 * @fileoverview MCP Files Module - Handles file-related intents and actions for MCP.
 * Exposes: id, name, capabilities, init, handleIntent. Aligned with MCP module system and phase1_architecture.md.
 */

const { normalizeFile } = require('../../graph/normalizers.cjs');

const FILES_CAPABILITIES = [
    'listFiles',
    'searchFiles',
    'downloadFile',
    'uploadFile',
    'getFileMetadata',
    'createSharingLink',
    'getSharingLinks',
    'removeSharingPermission',
    'getFileContent',
    'setFileContent',
    'updateFileContent'
];

const FilesModule = {
    id: 'files',
    name: 'OneDrive Files',
    capabilities: FILES_CAPABILITIES,
    /**
     * Lists files and folders in a directory (defaults to root)
     * @param {string} [parentId] - Parent folder ID (null for root)
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of files and folders
     */
    async listFiles(parentId, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.listFiles !== 'function') {
            throw new Error('GraphService.listFiles not implemented');
        }
        return await graphService.listFiles(parentId, req);
    },
    
    /**
     * Searches files by name
     * @param {string} query - Search query
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of matching files
     */
    async searchFiles(query, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.searchFiles !== 'function') {
            throw new Error('GraphService.searchFiles not implemented');
        }
        return await graphService.searchFiles(query, req);
    },
    
    /**
     * Downloads a file by ID
     * @param {string} id - File ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Buffer>} File content
     */
    async downloadFile(id, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.downloadFile !== 'function') {
            throw new Error('GraphService.downloadFile not implemented');
        }
        return await graphService.downloadFile(id, req);
    },
    
    /**
     * Uploads a file to root directory
     * @param {string} name - File name
     * @param {Buffer} content - File content
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} File metadata
     */
    async uploadFile(name, content, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.uploadFile !== 'function') {
            throw new Error('GraphService.uploadFile not implemented');
        }
        return await graphService.uploadFile(name, content, req);
    },
    
    /**
     * Retrieves metadata for a file by ID
     * @param {string} id - File ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} File metadata
     */
    async getFileMetadata(id, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getFileMetadata !== 'function') {
            throw new Error('GraphService.getFileMetadata not implemented');
        }
        return await graphService.getFileMetadata(id, req);
    },
    
    /**
     * Creates a sharing link for a file
     * @param {string} id - File ID
     * @param {string} type - Link type ('view', 'edit', etc.)
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} Sharing link
     */
    async createSharingLink(id, type = 'view', req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.createSharingLink !== 'function') {
            throw new Error('GraphService.createSharingLink not implemented');
        }
        return await graphService.createSharingLink(id, type, req);
    },
    
    /**
     * Gets sharing links for a file
     * @param {string} id - File ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of sharing links
     */
    async getSharingLinks(id, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getSharingLinks !== 'function') {
            throw new Error('GraphService.getSharingLinks not implemented');
        }
        return await graphService.getSharingLinks(id, req);
    },
    
    /**
     * Removes a sharing permission from a file
     * @param {string} fileId - File ID
     * @param {string} permissionId - Permission ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} Result
     */
    async removeSharingPermission(fileId, permissionId, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.removeSharingPermission !== 'function') {
            throw new Error('GraphService.removeSharingPermission not implemented');
        }
        return await graphService.removeSharingPermission(fileId, permissionId, req);
    },
    
    /**
     * Gets file content by ID
     * @param {string} id - File ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Buffer>} File content
     */
    async getFileContent(id, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getFileContent !== 'function') {
            throw new Error('GraphService.getFileContent not implemented');
        }
        return await graphService.getFileContent(id, req);
    },
    
    /**
     * Sets file content by ID
     * @param {string} id - File ID
     * @param {Buffer} content - File content
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} Updated file metadata
     */
    async setFileContent(id, content, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.setFileContent !== 'function') {
            throw new Error('GraphService.setFileContent not implemented');
        }
        return await graphService.setFileContent(id, content, req);
    },
    
    /**
     * Updates file content by ID
     * @param {string} id - File ID
     * @param {Buffer} content - File content
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} Updated file metadata
     */
    async updateFileContent(id, content, req) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.updateFileContent !== 'function') {
            throw new Error('GraphService.updateFileContent not implemented');
        }
        return await graphService.updateFileContent(id, content, req);
    },
    
    /**
     * Initializes the files module with dependencies.
     * @param {object} services - { graphService, cacheService }
     * @returns {object} Initialized module
     */
    init(services) {
        this.services = services;
        return this;
    },
    /**
     * Handles file-related intents routed to this module.
     * @param {string} intent
     * @param {object} entities
     * @param {object} context
     * @returns {Promise<object>} Normalized response
     */
    async handleIntent(intent, entities = {}, context = {}) {
        const { graphService, cacheService } = this.services || {};
        switch (intent) {
            case 'listFiles': {
                const folderId = entities.folderId || null;
                const cacheKey = `files:list:${folderId || 'root'}`;
                let files = cacheService && await cacheService.get(cacheKey);
                if (!files) {
                    const raw = await graphService.listFiles(folderId, context.req);
                    files = Array.isArray(raw) ? raw.map(normalizeFile) : [];
                    if (cacheService) await cacheService.set(cacheKey, files, 60);
                }
                return { type: 'fileList', items: files };
            }
            case 'searchFiles': {
                const query = entities.query || '';
                const cacheKey = `files:search:${query}`;
                let results = cacheService && await cacheService.get(cacheKey);
                if (!results) {
                    const raw = await graphService.searchFiles(query);
                    results = Array.isArray(raw) ? raw.map(normalizeFile) : [];
                    if (cacheService) await cacheService.set(cacheKey, results, 60);
                }
                return { type: 'fileList', items: results };
            }
            case 'downloadFile': {
                const { fileId } = entities;
                const file = await graphService.downloadFile(fileId);
                return { type: 'fileDownload', fileId, content: file };
            }
            case 'uploadFile': {
                const { name, content } = entities;
                const result = await graphService.uploadFile(name, content);
                return { type: 'fileUploadResult', file: normalizeFile(result) };
            }
            case 'getFileMetadata': {
                const { fileId } = entities;
                const meta = await graphService.getFileMetadata(fileId);
                return { type: 'fileMetadata', file: normalizeFile(meta) };
            }
            case 'createSharingLink': {
                const { fileId, type } = entities;
                const link = await graphService.createSharingLink(fileId, type);
                return { type: 'sharingLink', link };
            }
            case 'getSharingLinks': {
                const { fileId } = entities;
                const links = await graphService.getSharingLinks(fileId);
                return { type: 'sharingLinks', links };
            }
            case 'removeSharingPermission': {
                const { fileId, permissionId } = entities;
                const result = await graphService.removeSharingPermission(fileId, permissionId);
                return { type: 'removeSharingPermissionResult', result };
            }
            case 'getFileContent': {
                const { fileId } = entities;
                const content = await graphService.getFileContent(fileId);
                return { type: 'fileContent', fileId, content };
            }
            case 'setFileContent': {
                const { fileId, content } = entities;
                const result = await graphService.setFileContent(fileId, content);
                return { type: 'setFileContentResult', file: normalizeFile(result) };
            }
            case 'updateFileContent': {
                const { fileId, content } = entities;
                const result = await graphService.updateFileContent(fileId, content);
                return { type: 'updateFileContentResult', file: normalizeFile(result) };
            }
            default:
                throw new Error(`FilesModule cannot handle intent: ${intent}`);
        }
    }
};

module.exports = FilesModule;
