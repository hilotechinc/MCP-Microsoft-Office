/**
 * @fileoverview Handles /api/files endpoints for file operations.
 */

const Joi = require('joi');
const errorService = require('../../core/error-service');

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
            // Optionally validate query params
            const files = await filesModule.listFiles({
                parentId: req.query.parentId
            });
            res.json(files);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            res.status(500).json({ error: 'Internal error' });
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
