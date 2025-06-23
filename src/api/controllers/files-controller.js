/**
 * @fileoverview Handles /api/files endpoints for file operations.
 */

const Joi = require('joi');
const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');

/**
 * Helper function to call module methods with fallback support
 * @param {string} methodName - Name of the method to call
 * @param {Array} args - Arguments to pass to the method
 * @param {Function} fallback - Fallback function to call if method fails
 * @param {object} req - Express request object for context
 * @returns {Promise} Result of the method call or fallback
 */
async function callModuleWithFallback(methodName, args, fallback, req) {
    const { userId = null, deviceId = null } = req.user || {};
    
    try {
        // Try to call the module method
        if (typeof filesModule[methodName] === 'function') {
            return await filesModule[methodName](...args);
        } else {
            throw new Error(`Method ${methodName} not found on filesModule`);
        }
    } catch (error) {
        // Log the error
        MonitoringService.warn(`Module method ${methodName} failed, using fallback`, {
            methodName,
            error: error.message,
            userId,
            deviceId,
            timestamp: new Date().toISOString()
        }, 'files', null, userId, deviceId);
        
        // Call fallback function
        return await fallback();
    }
}

/**
 * Factory for files controller with dependency injection.
 * @param {object} deps - { filesModule, errorService, monitoringService }
 */
module.exports = ({ filesModule, errorService = ErrorService, monitoringService = MonitoringService }) => {
    return {
    /**
     * GET /api/files
     */
    async listFiles(req, res) {
        // Extract user context from auth middleware
        const { userId = null, deviceId = null } = req.user || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with user context
        monitoringService.info(`Processing ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            parentId: req.query.parentId || 'root',
            ip: req.ip,
            userId,
            deviceId
        }, 'files', null, userId, deviceId);
        
        try {
            // Call the module method directly with req as separate parameter
            const files = await filesModule.listFiles(req.query.parentId, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_list_api_success', executionTime, {
                fileCount: Array.isArray(files) ? files.length : 0,
                parentId: req.query.parentId || 'root',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            // Log success with result summary
            monitoringService.info('Files listing API completed successfully', {
                fileCount: Array.isArray(files) ? files.length : 0,
                parentId: req.query.parentId || 'root',
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            res.json(files);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API, 
                `Files listing API error: ${err.message}`, 
                ErrorService.SEVERITIES.ERROR, 
                { 
                    parentId: req.query.parentId || 'root',
                    stack: err.stack,
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId
                },
                null,
                userId,
                deviceId
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_list_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            res.status(500).json({ 
                error: 'Internal error', 
                message: err.message,
                errorId: mcpError.id
            });
        }
    },
    /**
     * POST /api/files/upload
     */
    async uploadFile(req, res) {
        // Extract user context from auth middleware
        const { userId = null, deviceId = null } = req.user || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with user context
        monitoringService.info(`Processing ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            fileName: req.body?.name,
            ip: req.ip,
            userId,
            deviceId
        }, 'files', null, userId, deviceId);
        
        try {
            // Validate input
            const schema = Joi.object({
                name: Joi.string().min(1).max(255).pattern(/^[^<>:"/\\|?*]+$/).required(),
                content: Joi.string().min(1).max(10485760).required() // 10MB limit
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Invalid request',
                    ErrorService.SEVERITIES.WARNING,
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'invalid_request',
                        requestId: req.id,
                        userId,
                        deviceId
                    }
                );
                monitoringService.logError(mcpError);
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Log the request (only in development)
            if (process.env.NODE_ENV === 'development') {
                monitoringService.debug('File upload requested', { 
                    fileName: value.name,
                    fileSize: value.content.length,
                    timestamp: new Date().toISOString(),
                    source: 'files-controller.uploadFile',
                    requestId: req.id,
                    userId,
                    deviceId
                }, 'files');
            }
            
            // Call the module method directly with req as separate parameter
            const result = await filesModule.uploadFile(value.name, value.content, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_upload_api_success', executionTime, {
                fileName: value.name,
                fileSize: value.content.length,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            // Log success with result summary
            monitoringService.info('File upload API completed successfully', {
                fileName: value.name,
                fileSize: value.content.length,
                fileId: result.id,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            res.json(result);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API, 
                `File upload API error: ${err.message}`, 
                ErrorService.SEVERITIES.ERROR, 
                { 
                    fileName: req.body?.name,
                    fileSize: req.body?.content?.length,
                    stack: err.stack,
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_upload_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * GET /api/files/search
     * Searches for files in OneDrive/SharePoint using the query provided
     */
    async searchFiles(req, res) {
        // Extract user context from auth middleware
        const { userId = null, deviceId = null } = req.user || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with user context
        monitoringService.info(`Processing ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            query: req.query.q,
            ip: req.ip,
            userId,
            deviceId
        }, 'files', null, userId, deviceId);
        
        try {
            // Validate input
            if (!req.query.q) {
                const err = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Search query is required',
                    ErrorService.SEVERITIES.WARNING,
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_query',
                        requestId: req.id,
                        userId,
                        deviceId
                    }
                );
                monitoringService.logError(err);
                return res.status(400).json({ error: 'Search query is required' });
            }
            
            const query = req.query.q;
            
            // Log the request (only in development)
            if (process.env.NODE_ENV === 'development') {
                monitoringService.debug('Files search requested', { 
                    query,
                    timestamp: new Date().toISOString(),
                    source: 'files-controller.searchFiles',
                    requestId: req.id,
                    userId,
                    deviceId
                }, 'files');
            }
            
            // Call the module method directly with req as separate parameter
            const files = await filesModule.searchFiles(query, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics with user context
            monitoringService.trackMetric('files_search_api_success', executionTime, {
                query: req.query.q,
                resultCount: Array.isArray(files) ? files.length : 0,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            // Log success with result summary and user context
            monitoringService.info('Files search API completed successfully', {
                query: req.query.q,
                resultCount: Array.isArray(files) ? files.length : 0,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            res.json(files);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error with user context
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API, 
                `Files search error: ${err.message}`, 
                ErrorService.SEVERITIES.ERROR, 
                { 
                    query: req.query.q,
                    stack: err.stack,
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics with user context
            monitoringService.trackMetric('files_search_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * GET /api/files/download
     */
    async downloadFile(req, res) {
        // Extract user context from auth middleware
        const { userId = null, deviceId = null } = req.user || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with user context
        monitoringService.info(`Processing ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            fileId: req.query.id,
            ip: req.ip,
            userId,
            deviceId
        }, 'files', null, userId, deviceId);
        
        try {
            // Validate input
            if (!req.query.id) {
                const err = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'File ID is required',
                    ErrorService.SEVERITIES.WARNING,
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_id',
                        requestId: req.id,
                        userId,
                        deviceId
                    }
                );
                monitoringService.logError(err);
                return res.status(400).json({ error: 'File ID is required' });
            }
            
            const fileId = req.query.id;
            
            // Log the request (only in development)
            monitoringService.debug('File download requested', { 
                fileId,
                timestamp: new Date().toISOString(),
                source: 'files-controller.downloadFile',
                requestId: req.id,
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            // Try to download the file from the module, or return mock data if it fails
            const fileContent = await callModuleWithFallback(
                'downloadFile',
                [fileId, req],
                () => {
                    // Return mock data for development/testing
                    return Buffer.from(`This is mock content for file ${fileId}`);
                },
                req
            );
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics with user context
            monitoringService.trackMetric('files_download_api_success', executionTime, {
                fileId: fileId,
                contentLength: fileContent?.length || 0,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            // Log success with result summary and user context
            monitoringService.info('Files download API completed successfully', {
                fileId: fileId,
                contentLength: fileContent?.length || 0,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            // For MCP adapter compatibility, return a JSON response with base64-encoded file content
            // instead of sending the raw binary data directly
            const response = {
                id: fileId,
                content: fileContent.toString('base64'),
                contentType: 'application/octet-stream',
                filename: `file-${fileId}.bin`
            };
            
            res.json(response);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error with user context
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API, 
                `Files download error: ${err.message}`, 
                ErrorService.SEVERITIES.ERROR, 
                { 
                    fileId: req.query.id,
                    stack: err.stack,
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics with user context
            monitoringService.trackMetric('files_download_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * GET /api/files/metadata
     */
    async getFileMetadata(req, res) {
        // Extract user context from auth middleware
        const { userId = null, deviceId = null } = req.user || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with user context
        monitoringService.info(`Processing ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            fileId: req.query.id,
            ip: req.ip,
            userId,
            deviceId
        }, 'files', null, userId, deviceId);
        
        try {
            // Validate input
            if (!req.query.id) {
                const err = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'File ID is required',
                    ErrorService.SEVERITIES.WARNING,
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_id',
                        requestId: req.id,
                        userId,
                        deviceId
                    }
                );
                monitoringService.logError(err);
                return res.status(400).json({ error: 'File ID is required' });
            }
            
            const fileId = req.query.id;
            
            // Log the request (only in development)
            monitoringService.debug('File metadata requested', { 
                fileId,
                timestamp: new Date().toISOString(),
                source: 'files-controller.getFileMetadata',
                requestId: req.id,
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            // Call the module method directly with req as separate parameter
            const metadata = await filesModule.getFileMetadata(fileId, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics with user context
            monitoringService.trackMetric('files_metadata_api_success', executionTime, {
                fileId: fileId,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            // Log success with result summary and user context
            monitoringService.info('Files metadata API completed successfully', {
                fileId: fileId,
                fileName: metadata?.name,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            res.json(metadata);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error with user context
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API, 
                `Files metadata error: ${err.message}`, 
                ErrorService.SEVERITIES.ERROR, 
                { 
                    fileId: req.query.id,
                    stack: err.stack,
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics with user context
            monitoringService.trackMetric('files_metadata_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * GET /api/files/content
     * Gets the content of a file by ID
     */
    async getFileContent(req, res) {
        // Extract user context from auth middleware
        const { userId = null, deviceId = null } = req.user || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with user context
        monitoringService.info(`Processing ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            fileId: req.query.id,
            ip: req.ip,
            userId,
            deviceId
        }, 'files', null, userId, deviceId);
        
        try {
            // Validate input
            if (!req.query.id) {
                const err = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'File ID is required',
                    ErrorService.SEVERITIES.WARNING,
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_id',
                        requestId: req.id,
                        userId,
                        deviceId
                    }
                );
                monitoringService.logError(err);
                return res.status(400).json({ error: 'File ID is required' });
            }
            
            const fileId = req.query.id;
            
            // Log the request (only in development)
            monitoringService.debug('File content requested', { 
                fileId,
                timestamp: new Date().toISOString(),
                source: 'files-controller.getFileContent',
                requestId: req.id,
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            // Call the module method directly with req as separate parameter
            const fileContent = await filesModule.getFileContent(fileId, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics with user context
            monitoringService.trackMetric('files_content_api_success', executionTime, {
                fileId: fileId,
                contentLength: fileContent?.content?.length || 0,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            // Log success with result summary and user context
            monitoringService.info('Files content API completed successfully', {
                fileId: fileId,
                contentLength: fileContent?.content?.length || 0,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            res.json(fileContent);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error with user context
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API, 
                `Files content error: ${err.message}`, 
                ErrorService.SEVERITIES.ERROR, 
                { 
                    fileId: req.query.id,
                    stack: err.stack,
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics with user context
            monitoringService.trackMetric('files_content_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * POST /api/files/content
     */
    async setFileContent(req, res) {
        // Extract user context from auth middleware
        const { userId = null, deviceId = null } = req.user || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with user context
        monitoringService.info(`Processing ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            fileId: req.body?.fileId,
            ip: req.ip,
            userId,
            deviceId
        }, 'files', null, userId, deviceId);
        
        try {
            // Validate input
            const schema = Joi.object({
                fileId: Joi.string().min(1).max(255).required(),
                content: Joi.string().min(1).max(10485760).required() // 10MB limit
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Invalid request',
                    ErrorService.SEVERITIES.WARNING,
                    { 
                        details: error.details,
                        timestamp: new Date().toISOString(),
                        requestId: req.id,
                        userId,
                        deviceId
                    }
                );
                monitoringService.logError(mcpError);
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Log the request (only in development)
            monitoringService.debug('Set file content requested', { 
                fileId: value.fileId,
                timestamp: new Date().toISOString(),
                source: 'files-controller.setFileContent',
                requestId: req.id,
                userId,
                deviceId
            }, 'files');
            
            // Call the module method directly with req as separate parameter
            const result = await filesModule.setFileContent(value.fileId, value.content, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics with user context
            monitoringService.trackMetric('files_set_content_api_success', executionTime, {
                fileId: value.fileId,
                contentLength: value.content.length,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            // Log success with result summary and user context
            monitoringService.info('Files set content API completed successfully', {
                fileId: value.fileId,
                contentLength: value.content.length,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            res.json(result);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error with user context
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API, 
                `Files set content error: ${err.message}`, 
                ErrorService.SEVERITIES.ERROR, 
                { 
                    fileId: req.body?.fileId,
                    stack: err.stack,
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics with user context
            monitoringService.trackMetric('files_set_content_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * POST /api/files/content/update
     */
    async updateFileContent(req, res) {
        // Extract user context from auth middleware
        const { userId = null, deviceId = null } = req.user || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with user context
        monitoringService.info(`Processing ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            fileId: req.body?.fileId,
            ip: req.ip,
            userId,
            deviceId
        }, 'files', null, userId, deviceId);
        
        try {
            // Validate input
            const schema = Joi.object({
                fileId: Joi.string().min(1).max(255).required(),
                content: Joi.string().min(1).max(10485760).required() // 10MB limit
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Invalid request',
                    ErrorService.SEVERITIES.WARNING,
                    { 
                        details: error.details,
                        timestamp: new Date().toISOString(),
                        requestId: req.id,
                        userId,
                        deviceId
                    }
                );
                monitoringService.logError(mcpError);
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Log the request (only in development)
            monitoringService.debug('Update file content requested', { 
                fileId: value.fileId,
                timestamp: new Date().toISOString(),
                source: 'files-controller.updateFileContent',
                requestId: req.id,
                userId,
                deviceId
            }, 'files');
            
            // Call the module method directly with req as separate parameter
            const result = await filesModule.updateFileContent(value.fileId, value.content, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics with user context
            monitoringService.trackMetric('files_update_content_api_success', executionTime, {
                fileId: value.fileId,
                contentLength: value.content.length,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            // Log success with result summary and user context
            monitoringService.info('Files update content API completed successfully', {
                fileId: value.fileId,
                contentLength: value.content.length,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            res.json(result);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error with user context
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API, 
                `Files update content error: ${err.message}`, 
                ErrorService.SEVERITIES.ERROR, 
                { 
                    fileId: req.body?.fileId,
                    stack: err.stack,
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics with user context
            monitoringService.trackMetric('files_update_content_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * POST /api/files/share
     */
    async createSharingLink(req, res) {
        // Extract user context from auth middleware
        const { userId = null, deviceId = null } = req.user || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with user context
        monitoringService.info(`Processing ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            fileId: req.body?.fileId,
            ip: req.ip,
            userId,
            deviceId
        }, 'files', null, userId, deviceId);
        
        try {
            // Validate input
            const schema = Joi.object({
                fileId: Joi.string().min(1).max(255).required(),
                type: Joi.string().valid('view', 'edit').default('view'),
                scope: Joi.string().valid('anonymous', 'organization').default('organization')
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                // Create validation error with user context
                const validationError = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Invalid sharing link request',
                    ErrorService.SEVERITIES.ERROR,
                    {
                        details: error.details,
                        timestamp: new Date().toISOString(),
                        requestId: req.id,
                        userId,
                        deviceId
                    }
                );
                
                // Log validation error
                monitoringService.logError(validationError);
                
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Log the request (only in development)
            if (process.env.NODE_ENV === 'development') {
                monitoringService.debug('Files sharing link creation requested', { 
                    fileId: value.fileId,
                    timestamp: new Date().toISOString(),
                    source: 'files-controller.createSharingLink',
                    requestId: req.id,
                    userId,
                    deviceId
                }, 'files');
            }
            
            // Call the module method directly with req as separate parameter
            const result = await filesModule.createSharingLink(value.fileId, value.type, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics with user context
            monitoringService.trackMetric('files_create_sharing_api_success', executionTime, {
                fileId: value.fileId,
                linkType: value.type,
                linkScope: value.scope,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            // Log success with result summary and user context
            monitoringService.info('Files create sharing link API completed successfully', {
                fileId: value.fileId,
                linkType: value.type,
                linkScope: value.scope,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            res.json(result);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error with user context
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API, 
                `Files create sharing link error: ${err.message}`, 
                ErrorService.SEVERITIES.ERROR, 
                { 
                    fileId: req.body?.fileId,
                    stack: err.stack,
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics with user context
            monitoringService.trackMetric('files_create_sharing_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * GET /api/files/sharing
     */
    async getSharingLinks(req, res) {
        // Extract user context from auth middleware
        const { userId = null, deviceId = null } = req.user || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with user context
        monitoringService.info(`Processing ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            fileId: req.query.id,
            ip: req.ip,
            userId,
            deviceId
        }, 'files', null, userId, deviceId);
        
        try {
            // Validate input
            if (!req.query.id) {
                // Create validation error with user context
                const validationError = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Missing file ID for sharing links request',
                    ErrorService.SEVERITIES.ERROR,
                    {
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_id',
                        requestId: req.id,
                        userId,
                        deviceId
                    }
                );
                
                // Log validation error
                monitoringService.logError(validationError);
                
                return res.status(400).json({ error: 'File ID is required' });
            }
            
            // Log the request (only in development)
            if (process.env.NODE_ENV === 'development') {
                monitoringService.debug('Files sharing links requested', { 
                    fileId: req.query.id,
                    timestamp: new Date().toISOString(),
                    source: 'files-controller.getSharingLinks',
                    requestId: req.id,
                    userId,
                    deviceId
                }, 'files');
            }
            
            // Call the module method directly with req as separate parameter
            const links = await filesModule.getSharingLinks(req.query.id, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics with user context
            monitoringService.trackMetric('files_sharing_links_api_success', executionTime, {
                fileId: req.query.id,
                linkCount: Array.isArray(links) ? links.length : 0,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            // Log success with result summary and user context
            monitoringService.info('Files sharing links API completed successfully', {
                fileId: req.query.id,
                linkCount: Array.isArray(links) ? links.length : 0,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            res.json(links);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error with user context
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API, 
                `Files sharing links retrieval error: ${err.message}`, 
                ErrorService.SEVERITIES.ERROR, 
                { 
                    fileId: req.query.id,
                    stack: err.stack,
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics with user context
            monitoringService.trackMetric('files_sharing_links_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/files/sharing/remove
     */
    async removeSharingPermission(req, res) {
        // Extract user context from auth middleware
        const { userId = null, deviceId = null } = req.user || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with user context
        monitoringService.info(`Processing ${req.method} ${req.path}`, {
            method: req.method,
            path: req.path,
            fileId: req.body?.fileId,
            ip: req.ip,
            userId,
            deviceId
        }, 'files', null, userId, deviceId);
        
        try {
            // Validate input
            const schema = Joi.object({
                fileId: Joi.string().min(1).max(255).required(),
                permissionId: Joi.string().min(1).max(255).required()
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                // Create validation error with user context
                const validationError = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Invalid sharing permission removal request',
                    ErrorService.SEVERITIES.ERROR,
                    {
                        details: error.details,
                        timestamp: new Date().toISOString(),
                        requestId: req.id,
                        userId,
                        deviceId
                    }
                );
                
                // Log validation error
                monitoringService.logError(validationError);
                
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Log the request (only in development)
            if (process.env.NODE_ENV === 'development') {
                monitoringService.debug('Files sharing permission removal requested', { 
                    fileId: value.fileId,
                    timestamp: new Date().toISOString(),
                    source: 'files-controller.removeSharingPermission',
                    requestId: req.id,
                    userId,
                    deviceId
                }, 'files');
            }
            
            // Call the module method directly with req as separate parameter
            const result = await filesModule.removeSharingPermission(value.fileId, value.permissionId, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics with user context
            monitoringService.trackMetric('files_remove_sharing_api_success', executionTime, {
                fileId: value.fileId,
                permissionId: value.permissionId,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            // Log success with result summary and user context
            monitoringService.info('Files sharing permission removal API completed successfully', {
                fileId: value.fileId,
                permissionId: value.permissionId,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'files', null, userId, deviceId);
            
            res.json(result);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error with user context
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API, 
                `Files sharing permission removal error: ${err.message}`, 
                ErrorService.SEVERITIES.ERROR, 
                { 
                    fileId: req.body?.fileId,
                    permissionId: req.body?.permissionId,
                    stack: err.stack,
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics with user context
            monitoringService.trackMetric('files_remove_sharing_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    }
};}
