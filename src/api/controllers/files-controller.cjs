/**
 * @fileoverview Handles /api/files endpoints for file operations.
 */

const Joi = require('joi');
const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');

/**
 * Factory for files controller with dependency injection.
 * @param {object} deps - { filesModule, errorService, monitoringService }
 */
module.exports = ({ filesModule, errorService = ErrorService, monitoringService = MonitoringService }) => {
    // Helper function to handle module calls with fallback to mock data
    async function callModuleWithFallback(methodName, params, mockGenerator, req) {
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with detailed parameters
        monitoringService.debug('Files controller method call requested', { 
            methodName,
            params: params.map(p => typeof p === 'object' ? 'object' : p),
            timestamp: new Date().toISOString(),
            source: `files-controller.${methodName}`
        }, 'files-api');
        
        let result;
        try {
            monitoringService.debug(`Attempting to call ${methodName} with real data`, {
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            if (typeof filesModule[methodName] === 'function') {
                result = await filesModule[methodName](...params);
                monitoringService.debug(`Successfully executed ${methodName} with real data`, {
                    timestamp: new Date().toISOString()
                }, 'files-api');
            } else if (typeof filesModule.handleIntent === 'function') {
                monitoringService.debug(`Falling back to handleIntent for ${methodName}`, {
                    timestamp: new Date().toISOString()
                }, 'files-api');
                
                const intentResult = await filesModule.handleIntent(methodName, params[0], { req });
                result = intentResult && intentResult.items ? intentResult.items : 
                        intentResult && intentResult.file ? intentResult.file : intentResult;
                        
                monitoringService.debug(`Executed ${methodName} via handleIntent`, {
                    timestamp: new Date().toISOString()
                }, 'files-api');
            } else {
                throw new Error(`No files module method available for ${methodName}`);
            }
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric(`files_controller_${methodName}_success`, executionTime, {
                timestamp: new Date().toISOString()
            });
            
            return result;
        } catch (moduleError) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Log the error
            monitoringService.error(`Error calling ${methodName}`, {
                error: moduleError.message,
                stack: moduleError.stack,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            // Track failure metrics
            monitoringService.trackMetric(`files_controller_${methodName}_failure`, executionTime, {
                errorType: moduleError.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            // Check if we're in development mode and mock data is enabled
            const isDevelopment = process.env.NODE_ENV === 'development';
            const useMockData = process.env.USE_MOCK_DATA === 'true';
            
            if (isDevelopment && useMockData) {
                // Log fallback to mock data in development mode
                monitoringService.warn(`Falling back to mock data for ${methodName} (development mode)`, {
                    timestamp: new Date().toISOString()
                }, 'files-api');
                
                result = mockGenerator();
                
                monitoringService.debug(`Generated mock data for ${methodName}`, {
                    timestamp: new Date().toISOString()
                }, 'files-api');
            } else {
                // In production or when mock data is disabled, create a standardized error
                const mcpError = errorService.createError(
                    errorService.CATEGORIES.GRAPH,
                    `Failed to execute ${methodName}: ${moduleError.message}`,
                    errorService.SEVERITIES.ERROR,
                    {
                        method: methodName,
                        params: params.map(p => typeof p === 'object' ? 'object' : p),
                        graphErrorCode: moduleError.code || 'unknown',
                        stack: moduleError.stack,
                        timestamp: new Date().toISOString()
                    }
                );
                
                // Log the error with the monitoring service
                monitoringService.logError(mcpError);
                
                // Rethrow the error for the caller to handle
                throw mcpError;
            }
        }
        return result;
    }
    
    return {
    /**
     * GET /api/files
     */
    async listFiles(req, res) {
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request
        monitoringService.debug('Files listing requested', { 
            parentId: req.query.parentId || 'root',
            timestamp: new Date().toISOString(),
            source: 'files-controller.listFiles',
            requestId: req.id
        }, 'files-api');
        
        try {
            // Use the helper function to get files
            const files = await callModuleWithFallback(
                'listFiles',
                [req.query.parentId, req],
                () => {
                    // Return mock data for development/testing
                    return [
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
                },
                req
            );
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_list_api_success', executionTime, {
                fileCount: Array.isArray(files) ? files.length : 0,
                parentId: req.query.parentId || 'root',
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService.info('Files listing API completed successfully', {
                fileCount: Array.isArray(files) ? files.length : 0,
                parentId: req.query.parentId || 'root',
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            res.json(files);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = errorService.createError(
                'api', 
                `Files listing API error: ${err.message}`, 
                'error', 
                { 
                    parentId: req.query.parentId || 'root',
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_list_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * POST /api/files/upload
     */
    async uploadFile(req, res) {
        // Start tracking execution time
        const startTime = Date.now();
        
        try {
            // Validate input
            const schema = Joi.object({
                name: Joi.string().min(1).required(),
                content: Joi.string().min(1).required()
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                const mcpError = errorService.createError(
                    'api',
                    'Invalid request',
                    'warn',
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'invalid_request',
                        requestId: req.id
                    }
                );
                monitoringService.logError(mcpError);
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Log the request
            monitoringService.debug('File upload requested', { 
                fileName: value.name,
                fileSize: value.content.length,
                timestamp: new Date().toISOString(),
                source: 'files-controller.uploadFile',
                requestId: req.id
            }, 'files-api');
            
            // Try to upload the file using the module, or return mock data if it fails
            const result = await callModuleWithFallback(
                'uploadFile',
                [value.name, value.content, req],
                () => {
                    // Return mock data for development/testing
                    return { 
                        id: `mock-upload-${Date.now()}`, 
                        name: value.name,
                        size: value.content.length,
                        webUrl: `https://example.com/files/mock-upload`,
                        createdDateTime: new Date().toISOString(),
                        lastModifiedDateTime: new Date().toISOString()
                    };
                },
                req
            );
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_upload_api_success', executionTime, {
                fileName: value.name,
                fileSize: value.content.length,
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService.info('File upload API completed successfully', {
                fileName: value.name,
                fileSize: value.content.length,
                fileId: result.id,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            res.json(result);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = errorService.createError(
                'api', 
                `File upload API error: ${err.message}`, 
                'error', 
                { 
                    fileName: req.body?.name,
                    fileSize: req.body?.content?.length,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_upload_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * GET /api/files/search
     * Searches for files in OneDrive/SharePoint using the query provided
     */
    async searchFiles(req, res) {
        // Start tracking execution time
        const startTime = Date.now();
        
        try {
            // Validate input
            if (!req.query.q) {
                const err = errorService.createError(
                    'api',
                    'Search query is required',
                    'warn',
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_query',
                        requestId: req.id
                    }
                );
                monitoringService.logError(err);
                return res.status(400).json({ error: 'Search query is required' });
            }
            
            const query = req.query.q;
            
            // Log the request
            monitoringService.debug('Files search requested', { 
                query,
                timestamp: new Date().toISOString(),
                source: 'files-controller.searchFiles',
                requestId: req.id
            }, 'files-api');
            
            // Use the helper function to search files
            const files = await callModuleWithFallback(
                'searchFiles',
                [query, req],
                () => {
                    // Return mock data for development/testing
                    return [
                        { 
                            id: 'mock-search1', 
                            name: `Search Result for ${query}.docx`,
                            size: 1024 * 1024,
                            webUrl: 'https://example.com/files/mock-search1',
                            createdDateTime: new Date().toISOString(),
                            lastModifiedDateTime: new Date().toISOString()
                        },
                        { 
                            id: 'mock-search2', 
                            name: `Another ${query} Result.xlsx`,
                            size: 512 * 1024,
                            webUrl: 'https://example.com/files/mock-search2',
                            createdDateTime: new Date().toISOString(),
                            lastModifiedDateTime: new Date().toISOString()
                        }
                    ];
                },
                req
            );
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_search_api_success', executionTime, {
                resultCount: Array.isArray(files) ? files.length : 0,
                queryLength: query.length,
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService.info('Files search API completed successfully', {
                resultCount: Array.isArray(files) ? files.length : 0,
                queryLength: query.length,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            res.json(files);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = errorService.createError(
                'api', 
                `Files search API error: ${err.message}`, 
                'error', 
                { 
                    query: req.query.q,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_search_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * GET /api/files/download
     */
    async downloadFile(req, res) {
        // Start tracking execution time
        const startTime = Date.now();
        
        try {
            if (!req.query.id) {
                const err = errorService.createError(
                    'api',
                    'File ID is required for download',
                    'warn',
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_id',
                        requestId: req.id
                    }
                );
                monitoringService.logError(err);
                return res.status(400).json({ error: 'File ID is required' });
            }
            
            const fileId = req.query.id;
            
            // Log the request
            monitoringService.debug('File download requested', { 
                fileId,
                timestamp: new Date().toISOString(),
                source: 'files-controller.downloadFile',
                requestId: req.id
            }, 'files-api');
            
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
            
            // Log success metrics
            monitoringService.trackMetric('files_download_api_success', executionTime, {
                fileId,
                contentSize: fileContent ? fileContent.length : 0,
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService.info('File download API completed successfully', {
                fileId,
                contentSize: fileContent ? fileContent.length : 0,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
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
            
            // Create standardized error
            const mcpError = errorService.createError(
                'api', 
                `File download API error: ${err.message}`, 
                'error', 
                { 
                    fileId: req.query.id,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_download_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * GET /api/files/metadata
     */
    async getFileMetadata(req, res) {
        // Start tracking execution time
        const startTime = Date.now();
        
        try {
            if (!req.query.id) {
                const err = errorService.createError(
                    'api',
                    'File ID is required',
                    'warn',
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_id',
                        requestId: req.id
                    }
                );
                monitoringService.logError(err);
                return res.status(400).json({ error: 'File ID is required' });
            }
            
            const fileId = req.query.id;
            
            // Log the request
            monitoringService.debug('File metadata requested', { 
                fileId,
                timestamp: new Date().toISOString(),
                source: 'files-controller.getFileMetadata',
                requestId: req.id
            }, 'files-api');
            
            // Try to get file metadata from the module, or return mock data if it fails
            const metadata = await callModuleWithFallback(
                'getFileMetadata',
                [fileId, req],
                () => {
                    // Return mock data for development/testing
                    return { 
                        id: fileId, 
                        name: `File ${fileId}.docx`,
                        size: 1024 * 1024,
                        webUrl: `https://example.com/files/${fileId}`,
                        createdDateTime: new Date().toISOString(),
                        lastModifiedDateTime: new Date().toISOString()
                    };
                },
                req
            );
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_metadata_api_success', executionTime, {
                fileId,
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService.info('File metadata API completed successfully', {
                fileId,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            res.json(metadata);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = errorService.createError(
                'api', 
                `File metadata API error: ${err.message}`, 
                'error', 
                { 
                    fileId: req.query.id,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_metadata_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * GET /api/files/content
     * Gets the content of a file by ID
     */
    async getFileContent(req, res) {
        // Start tracking execution time
        const startTime = Date.now();
        
        try {
            if (!req.query.id) {
                const err = errorService.createError(
                    'api',
                    'File ID is required',
                    'warn',
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_id',
                        requestId: req.id
                    }
                );
                monitoringService.logError(err);
                return res.status(400).json({ error: 'File ID is required' });
            }
            
            const fileId = req.query.id;
            
            // Log the request
            monitoringService.debug('File content requested', { 
                fileId,
                timestamp: new Date().toISOString(),
                source: 'files-controller.getFileContent',
                requestId: req.id
            }, 'files-api');
            
            // Try to get file content from the module, or return mock data if it fails
            const fileContent = await callModuleWithFallback(
                'getFileContent',
                [fileId, req],
                () => {
                    // Return mock data for development/testing
                    return { 
                        content: 'This is mock file content for development purposes.',
                        contentType: 'text/plain'
                    };
                },
                req
            );
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_content_api_success', executionTime, {
                fileId,
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService.info('File content API completed successfully', {
                fileId,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            // Set the appropriate content type header if returning raw content
            if (req.query.raw === 'true' && fileContent && fileContent.contentType) {
                res.setHeader('Content-Type', fileContent.contentType);
                res.setHeader('Content-Disposition', `attachment; filename=file-${fileId}`);
                return res.send(fileContent.content);
            }
            
            // Otherwise return a JSON response with the content
            res.json({
                id: fileId,
                content: fileContent.content,
                contentType: fileContent.contentType
            });
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = errorService.createError(
                'api', 
                `File content API error: ${err.message}`, 
                'error', 
                { 
                    fileId: req.query.id,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_content_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * POST /api/files/content
     */
    async setFileContent(req, res) {
        // Start tracking execution time
        const startTime = Date.now();
        
        try {
            const schema = Joi.object({
                id: Joi.string().required(),
                content: Joi.required()
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                const mcpError = errorService.createError(
                    'api',
                    'Invalid request',
                    'warn',
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'invalid_request',
                        requestId: req.id
                    }
                );
                monitoringService.logError(mcpError);
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Log the request
            monitoringService.debug('Set file content requested', { 
                fileId: value.id,
                timestamp: new Date().toISOString(),
                source: 'files-controller.setFileContent',
                requestId: req.id
            }, 'files-api');
            
            // Try to set file content using the module, or return mock data if it fails
            const result = await callModuleWithFallback(
                'setFileContent',
                [value.id, value.content, req],
                () => {
                    // Return mock data for development/testing
                    return { 
                        id: value.id,
                        name: `File-${value.id}.docx`,
                        size: value.content.length,
                        webUrl: `https://example.com/files/${value.id}`,
                        lastModifiedDateTime: new Date().toISOString()
                    };
                },
                req
            );
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_set_content_api_success', executionTime, {
                fileId: value.id,
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService.info('Set file content API completed successfully', {
                fileId: value.id,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            res.json(result);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = errorService.createError(
                'api', 
                `Set file content API error: ${err.message}`, 
                'error', 
                { 
                    fileId: req.body?.id,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_set_content_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * POST /api/files/content/update
     */
    async updateFileContent(req, res) {
        // Start tracking execution time
        const startTime = Date.now();
        
        try {
            const schema = Joi.object({
                id: Joi.string().required(),
                content: Joi.required()
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                const mcpError = errorService.createError(
                    'api',
                    'Invalid request',
                    'warn',
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'invalid_request',
                        requestId: req.id
                    }
                );
                monitoringService.logError(mcpError);
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Log the request
            monitoringService.debug('Update file content requested', { 
                fileId: value.id,
                timestamp: new Date().toISOString(),
                source: 'files-controller.updateFileContent',
                requestId: req.id
            }, 'files-api');
            
            // Try to update file content using the module, or return mock data if it fails
            const result = await callModuleWithFallback(
                'updateFileContent',
                [value.id, value.content, req],
                () => {
                    // Return mock data for development/testing
                    return { 
                        id: value.id,
                        name: `File-${value.id}.docx`,
                        size: value.content.length,
                        webUrl: `https://example.com/files/${value.id}`,
                        lastModifiedDateTime: new Date().toISOString()
                    };
                },
                req
            );
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_update_content_api_success', executionTime, {
                fileId: value.id,
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService.info('Update file content API completed successfully', {
                fileId: value.id,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            res.json(result);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = errorService.createError(
                'api', 
                `Update file content API error: ${err.message}`, 
                'error', 
                { 
                    fileId: req.body?.id,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_update_content_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * POST /api/files/share
     */
    async createSharingLink(req, res) {
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request
        monitoringService.debug('Files sharing link creation requested', { 
            timestamp: new Date().toISOString(),
            source: 'files-controller.createSharingLink',
            requestId: req.id
        }, 'files-api');
        
        try {
            const schema = Joi.object({
                id: Joi.string().required(),
                type: Joi.string().valid('view', 'edit').default('view')
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                // Create validation error
                const validationError = errorService.createError(
                    'api',
                    'Invalid sharing link request',
                    'error',
                    {
                        details: error.details,
                        timestamp: new Date().toISOString()
                    }
                );
                
                // Log validation error
                monitoringService.logError(validationError);
                
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
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_sharing_link_api_success', executionTime, {
                fileId: value.id,
                type: value.type,
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService.info('Files sharing link creation API completed successfully', {
                fileId: value.id,
                type: value.type,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            res.json(result);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = errorService.createError(
                'api', 
                `Files sharing link creation error: ${err.message}`, 
                'error', 
                { 
                    fileId: req.body?.id,
                    type: req.body?.type,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_sharing_link_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * GET /api/files/sharing
     */
    async getSharingLinks(req, res) {
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request
        monitoringService.debug('Files sharing links requested', { 
            fileId: req.query.id || 'missing',
            timestamp: new Date().toISOString(),
            source: 'files-controller.getSharingLinks',
            requestId: req.id
        }, 'files-api');
        
        try {
            if (!req.query.id) {
                // Create validation error
                const validationError = errorService.createError(
                    'api',
                    'Missing file ID for sharing links request',
                    'error',
                    {
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_id'
                    }
                );
                
                // Log validation error
                monitoringService.logError(validationError);
                
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
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_sharing_links_api_success', executionTime, {
                fileId: req.query.id,
                linkCount: Array.isArray(links) ? links.length : 0,
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService.info('Files sharing links API completed successfully', {
                fileId: req.query.id,
                linkCount: Array.isArray(links) ? links.length : 0,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            res.json(links);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = errorService.createError(
                'api', 
                `Files sharing links retrieval error: ${err.message}`, 
                'error', 
                { 
                    fileId: req.query.id,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_sharing_links_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/files/sharing/remove
     */
    async removeSharingPermission(req, res) {
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request
        monitoringService.debug('Files sharing permission removal requested', { 
            timestamp: new Date().toISOString(),
            source: 'files-controller.removeSharingPermission',
            requestId: req.id
        }, 'files-api');
        
        try {
            const schema = Joi.object({
                fileId: Joi.string().required(),
                permissionId: Joi.string().required()
            });
            
            const { error, value } = schema.validate(req.body);
            if (error) {
                // Create validation error
                const validationError = errorService.createError(
                    'api',
                    'Invalid sharing permission removal request',
                    'error',
                    {
                        details: error.details,
                        timestamp: new Date().toISOString()
                    }
                );
                
                // Log validation error
                monitoringService.logError(validationError);
                
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
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService.trackMetric('files_remove_sharing_api_success', executionTime, {
                fileId: value.fileId,
                permissionId: value.permissionId,
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService.info('Files sharing permission removal API completed successfully', {
                fileId: value.fileId,
                permissionId: value.permissionId,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files-api');
            
            res.json(result);
        } catch (err) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Create standardized error
            const mcpError = errorService.createError(
                'api', 
                `Files sharing permission removal error: ${err.message}`, 
                'error', 
                { 
                    fileId: req.body?.fileId,
                    permissionId: req.body?.permissionId,
                    stack: err.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService.logError(mcpError);
            
            // Track failure metrics
            monitoringService.trackMetric('files_remove_sharing_api_failure', executionTime, {
                errorType: err.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    }
};}
