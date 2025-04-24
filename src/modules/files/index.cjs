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
                    const raw = await graphService.listFiles(folderId);
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
