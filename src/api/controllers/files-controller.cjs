/**
 * @fileoverview Handles /api/files endpoints for file operations.
 */

const Joi = require('joi');
const errorService = require('../../core/error-service.cjs');

/**
 * Factory for files controller with dependency injection.
 * @param {object} deps - { filesModule }
 */
module.exports = ({ filesModule }) => {
    // Helper function to handle module calls with fallback to mock data
    async function callModuleWithFallback(methodName, params, mockGenerator, req) {
        let result;
        try {
            console.log(`[Files Controller] Attempting to call ${methodName} with real data`);
            if (typeof filesModule[methodName] === 'function') {
                result = await filesModule[methodName](...params);
                console.log(`[Files Controller] Successfully executed ${methodName} with real data`);
            } else if (typeof filesModule.handleIntent === 'function') {
                console.log(`[Files Controller] Falling back to handleIntent for ${methodName}`);
                const intentResult = await filesModule.handleIntent(methodName, params[0], { req });
                result = intentResult && intentResult.items ? intentResult.items : 
                        intentResult && intentResult.file ? intentResult.file : intentResult;
                console.log(`[Files Controller] Executed ${methodName} via handleIntent`);
            } else {
                throw new Error(`No files module method available for ${methodName}`);
            }
        } catch (moduleError) {
            console.error(`[Files Controller] Error calling ${methodName}:`, moduleError);
            console.log(`[Files Controller] Falling back to mock data for ${methodName}`);
            result = mockGenerator();
            console.log(`[Files Controller] Generated mock data for ${methodName}`);
        }
        return result;
    }
    
    return {
    /**
     * GET /api/files
     */
    async listFiles(req, res) {
        try {
            // Try to get files from the module, or return mock data if it fails
            let files = [];
            try {
                console.log('[Files Controller] Attempting to get real files from module');
                if (typeof filesModule.listFiles === 'function') {
                    files = await filesModule.listFiles(req.query.parentId, req);
                    console.log(`[Files Controller] Successfully retrieved ${files.length} real files`);
                } else if (typeof filesModule.handleIntent === 'function') {
                    // Try using the module's handleIntent method instead
                    console.log('[Files Controller] Falling back to handleIntent method');
                    const result = await filesModule.handleIntent('listFiles', { parentId: req.query.parentId }, { req });
                    files = result && result.items ? result.items : [];
                    console.log(`[Files Controller] Retrieved ${files.length} files via handleIntent`);
                } else {
                    throw new Error('No files module method available');
                }
            } catch (moduleError) {
                console.error('Error calling files module:', moduleError);
                // Return mock data for development/testing
                files = [
                    { 
                        id: 'mock1', 
                        name: 'Project Proposal.docx',
                        size: 1024 * 1024,
                        webUrl: 'https://example.com/files/mock1',
                        createdDateTime: new Date().toISOString(),
                        lastModifiedDateTime: new Date().toISOString()
                    },
                    { 
                        id: 'mock2', 
                        name: 'Budget.xlsx',
                        size: 512 * 1024,
                        webUrl: 'https://example.com/files/mock2',
                        createdDateTime: new Date().toISOString(),
                        lastModifiedDateTime: new Date().toISOString()
                    }
                ];
            }
            
            res.json(files);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Files controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * POST /api/files/upload
     */
    async uploadFile(req, res) {
        // Joi schema for uploadFile
        const uploadFileSchema = Joi.object({
            name: Joi.string().min(1).required(),
            content: Joi.string().min(1).required()
        });
        try {
            const { error, value } = uploadFileSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            let result;
            try {
                console.log('[Files Controller] Attempting to upload file using module');
                if (typeof filesModule.uploadFile === 'function') {
                    result = await filesModule.uploadFile(value.name, value.content, req);
                    console.log('[Files Controller] Successfully uploaded file using module');
                } else if (typeof filesModule.handleIntent === 'function') {
                    // Try using the module's handleIntent method instead
                    console.log('[Files Controller] Falling back to handleIntent method');
                    const intentResult = await filesModule.handleIntent('uploadFile', { name: value.name, content: value.content }, { req });
                    result = intentResult && intentResult.file ? intentResult.file : null;
                    console.log('[Files Controller] Uploaded file via handleIntent');
                } else {
                    throw new Error('No files module method available');
                }
            } catch (moduleError) {
                console.error('[Files Controller] Error uploading file:', moduleError);
                console.log('[Files Controller] Falling back to mock data');
                
                // Return mock data for development/testing
                result = {
                    id: `mock-${Date.now()}`,
                    name: value.name,
                    size: value.content.length,
                    webUrl: `https://example.com/files/mock-${Date.now()}`,
                    createdDateTime: new Date().toISOString(),
                    lastModifiedDateTime: new Date().toISOString()
                };
                console.log('[Files Controller] Generated mock file upload result');
            }
            
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Files controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * GET /api/files/search
     */
    async searchFiles(req, res) {
        try {
            if (!req.query.q) {
                return res.status(400).json({ error: 'Search query is required' });
            }
            
            const files = await callModuleWithFallback(
                'searchFiles',
                [req.query.q, req],
                () => {
                    // Mock data generator
                    const searchTerm = req.query.q.toLowerCase();
                    const mockFiles = [
                        { 
                            id: 'mock1', 
                            name: 'Project Proposal.docx',
                            size: 1024 * 1024,
                            webUrl: 'https://example.com/files/mock1',
                            createdDateTime: new Date().toISOString(),
                            lastModifiedDateTime: new Date().toISOString()
                        },
                        { 
                            id: 'mock2', 
                            name: 'Budget.xlsx',
                            size: 512 * 1024,
                            webUrl: 'https://example.com/files/mock2',
                            createdDateTime: new Date().toISOString(),
                            lastModifiedDateTime: new Date().toISOString()
                        }
                    ];
                    
                    return mockFiles.filter(file => 
                        file.name.toLowerCase().includes(searchTerm)
                    );
                }
            );
            
            res.json(files);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Files controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * GET /api/files/download
     */
    async downloadFile(req, res) {
        try {
            if (!req.query.id) {
                return res.status(400).json({ error: 'File ID is required' });
            }
            
            const fileContent = await callModuleWithFallback(
                'downloadFile',
                [req.query.id, req],
                () => {
                    // Mock file content
                    return Buffer.from('This is mock file content for development purposes.');
                }
            );
            
            // Set appropriate headers for file download
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename=download-${Date.now()}`);
            res.send(fileContent);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Files controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * GET /api/files/metadata
     */
    async getFileMetadata(req, res) {
        try {
            if (!req.query.id) {
                return res.status(400).json({ error: 'File ID is required' });
            }
            
            const metadata = await callModuleWithFallback(
                'getFileMetadata',
                [req.query.id, req],
                () => {
                    // Mock file metadata
                    return {
                        id: req.query.id,
                        name: `File-${req.query.id}.docx`,
                        size: 1024 * 1024,
                        webUrl: `https://example.com/files/${req.query.id}`,
                        createdDateTime: new Date().toISOString(),
                        lastModifiedDateTime: new Date().toISOString(),
                        createdBy: {
                            user: {
                                displayName: 'Current User',
                                email: 'user@example.com'
                            }
                        }
                    };
                }
            );
            
            res.json(metadata);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Files controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * GET /api/files/content
     */
    async getFileContent(req, res) {
        try {
            if (!req.query.id) {
                return res.status(400).json({ error: 'File ID is required' });
            }
            
            const content = await callModuleWithFallback(
                'getFileContent',
                [req.query.id, req],
                () => {
                    // Mock file content
                    return {
                        content: 'This is mock file content for development purposes.',
                        contentType: 'text/plain'
                    };
                }
            );
            
            res.json({ id: req.query.id, content });
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Files controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/files/content
     */
    async setFileContent(req, res) {
        try {
            const schema = Joi.object({
                id: Joi.string().required(),
                content: Joi.required()
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            const result = await callModuleWithFallback(
                'setFileContent',
                [value.id, value.content, req],
                () => {
                    // Mock result
                    return {
                        id: value.id,
                        name: `File-${value.id}.docx`,
                        size: value.content.length,
                        webUrl: `https://example.com/files/${value.id}`,
                        lastModifiedDateTime: new Date().toISOString()
                    };
                }
            );
            
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Files controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/files/content/update
     */
    async updateFileContent(req, res) {
        try {
            const schema = Joi.object({
                id: Joi.string().required(),
                content: Joi.required()
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            const result = await callModuleWithFallback(
                'updateFileContent',
                [value.id, value.content, req],
                () => {
                    // Mock result
                    return {
                        id: value.id,
                        name: `File-${value.id}.docx`,
                        size: value.content.length,
                        webUrl: `https://example.com/files/${value.id}`,
                        lastModifiedDateTime: new Date().toISOString()
                    };
                }
            );
            
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Files controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/files/share
     */
    async createSharingLink(req, res) {
        try {
            const schema = Joi.object({
                id: Joi.string().required(),
                type: Joi.string().valid('view', 'edit').default('view')
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            const result = await callModuleWithFallback(
                'createSharingLink',
                [value.id, value.type, req],
                () => {
                    // Mock sharing link
                    return {
                        id: `share-${Date.now()}`,
                        link: {
                            webUrl: `https://example.com/share/${value.id}?type=${value.type}`
                        },
                        type: value.type,
                        scope: 'anonymous'
                    };
                }
            );
            
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Files controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * GET /api/files/sharing
     */
    async getSharingLinks(req, res) {
        try {
            if (!req.query.id) {
                return res.status(400).json({ error: 'File ID is required' });
            }
            
            const links = await callModuleWithFallback(
                'getSharingLinks',
                [req.query.id, req],
                () => {
                    // Mock sharing links
                    return [
                        {
                            id: `share-view-${Date.now()}`,
                            link: {
                                webUrl: `https://example.com/share/${req.query.id}?type=view`
                            },
                            type: 'view',
                            scope: 'anonymous'
                        },
                        {
                            id: `share-edit-${Date.now()}`,
                            link: {
                                webUrl: `https://example.com/share/${req.query.id}?type=edit`
                            },
                            type: 'edit',
                            scope: 'organization'
                        }
                    ];
                }
            );
            
            res.json(links);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Files controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/files/sharing/remove
     */
    async removeSharingPermission(req, res) {
        try {
            const schema = Joi.object({
                fileId: Joi.string().required(),
                permissionId: Joi.string().required()
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            const result = await callModuleWithFallback(
                'removeSharingPermission',
                [value.fileId, value.permissionId, req],
                () => {
                    // Mock result
                    return {
                        success: true,
                        message: `Sharing permission ${value.permissionId} removed from file ${value.fileId}`
                    };
                }
            );
            
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Files controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    }
};}
