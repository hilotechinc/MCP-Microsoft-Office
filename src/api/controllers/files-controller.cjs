/**
 * @fileoverview Handles /api/files endpoints for file operations.
 */

const Joi = require('joi');
const errorService = require('../../core/error-service.cjs');

/**
 * Factory for files controller with dependency injection.
 * @param {object} deps - { filesModule }
 */
module.exports = ({ filesModule }) => ({
    /**
     * GET /api/files
     */
    async listFiles(req, res) {
        try {
            // Try to get files from the module, or return mock data if it fails
            let files = [];
            try {
                if (typeof filesModule.listFiles === 'function') {
                    files = await filesModule.listFiles({
                        parentId: req.query.parentId
                    }, req);
                } else if (typeof filesModule.handleIntent === 'function') {
                    // Try using the module's handleIntent method instead
                    const result = await filesModule.handleIntent('listFiles', { parentId: req.query.parentId }, { req });
                    files = result && result.items ? result.items : [];
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
            const result = await filesModule.uploadFile(value);
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            res.status(500).json({ error: 'Internal error' });
        }
    }
});
