/**
 * @fileoverview MCP Files Module - Handles file-related intents and actions for MCP.
 * Exposes: id, name, capabilities, init, handleIntent. Aligned with MCP module system and phase1_architecture.md.
 */

const { normalizeFile } = require('../../graph/normalizers.cjs');
const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');

// Log module initialization
MonitoringService.info('Files Module initialized', {
    serviceName: 'files-module',
    capabilities: 13, // FILES_CAPABILITIES.length will be 13
    timestamp: new Date().toISOString()
}, 'files');

// Define the capabilities supported by this module
// This array is used by the module registry to find appropriate modules for different intents
const FILES_CAPABILITIES = [
    'listFiles',
    'searchFiles',      // File search capability using query strings (required for search API endpoint)
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
    /**
     * Helper method to redact sensitive data from objects before logging
     * @param {object} data - The data object to redact
     * @returns {object} Redacted copy of the data
     * @private
     */
    redactSensitiveData(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        
        // Create a deep copy to avoid modifying the original
        const result = Array.isArray(data) ? [...data] : {...data};
        
        // Fields that should be redacted
        const sensitiveFields = [
            'user', 'email', 'mail', 'address', 'emailAddress', 'password', 'token', 'accessToken',
            'refreshToken', 'content', 'body', 'contentBytes'
        ];
        
        // Recursively process the object
        for (const key in result) {
            if (Object.prototype.hasOwnProperty.call(result, key)) {
                // Check if this is a sensitive field
                if (sensitiveFields.includes(key.toLowerCase())) {
                    if (typeof result[key] === 'string') {
                        result[key] = 'REDACTED';
                    } else if (Array.isArray(result[key])) {
                        result[key] = `[${result[key].length} items]`;
                    } else if (typeof result[key] === 'object' && result[key] !== null) {
                        result[key] = '{REDACTED}';
                    }
                } 
                // Recursively process nested objects
                else if (typeof result[key] === 'object' && result[key] !== null) {
                    result[key] = this.redactSensitiveData(result[key]);
                }
            }
        }
        
        return result;
    },
    
    id: 'files',
    name: 'OneDrive Files',
    capabilities: FILES_CAPABILITIES,
    
    /**
     * Initializes the files module with dependencies.
     * @param {object} services - { graphService, errorService, monitoringService }
     * @returns {object} Initialized module
     */
    init(services) {
        // Validate that required services are provided
        const requiredServices = ['graphService', 'errorService', 'monitoringService']; 
        
        // Use imported services as fallbacks during initialization
        const errorService = services?.errorService || ErrorService;
        const monitoringService = services?.monitoringService || MonitoringService;

        // Log initialization attempt
        monitoringService?.debug('Initializing Files Module', { 
            timestamp: new Date().toISOString() 
        }, 'files');

        if (!services) {
            const error = errorService?.createError(
                'files',
                'FilesModule init requires a services object',
                'error',
                { timestamp: new Date().toISOString() }
            ) || {
                category: 'files',
                message: 'FilesModule init requires a services object',
                severity: 'error',
                context: {}
            };
            
            monitoringService?.logError(error) || 
                console.error('[MCP FILES] FilesModule init requires a services object');
                
            throw error;
        }

        // Validate required services
        for (const serviceName of requiredServices) {
            if (!services[serviceName]) {
                const error = errorService?.createError(
                    'files',
                    `FilesModule init failed: Required service '${serviceName}' is missing`,
                    'error',
                    { 
                        missingService: serviceName,
                        timestamp: new Date().toISOString() 
                    }
                ) || {
                    category: 'files',
                    message: `FilesModule init failed: Required service '${serviceName}' is missing`,
                    severity: 'error',
                    context: { missingService: serviceName }
                };
                
                monitoringService?.logError(error) || 
                    console.error(`[MCP FILES] FilesModule init failed: Required service '${serviceName}' is missing`);
                    
                throw error;
            }
        }

        this.services = services;
        
        // Log successful initialization
        monitoringService?.info('FilesModule initialized successfully', { 
            timestamp: new Date().toISOString() 
        }, 'files') || 
            console.info('[MCP FILES] FilesModule initialized successfully with required services');
            
        return this; // Return the module instance, now containing validated services
    },
    /**
     * Lists files and folders in a directory (defaults to root)
     * @param {string} [parentId] - Parent folder ID (null for root)
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of files and folders
     */
    async listFiles(parentId, req) {
        // Get services with fallbacks
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with detailed parameters
        monitoringService?.debug('Files listing requested', { 
            parentId: parentId || 'root',
            timestamp: new Date().toISOString(),
            source: 'files.listFiles'
        }, 'files');
        
        try {
            // Validate that GraphService is available
            if (!graphService || typeof graphService.listFiles !== 'function') {
                const err = errorService.createError(
                    'files',
                    'GraphService.listFiles not implemented',
                    'error',
                    { 
                        parentId: parentId || 'root',
                        timestamp: new Date().toISOString(),
                        serviceError: 'missing_graph_service'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            // Call the Graph service
            const result = await graphService.listFiles(parentId, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService?.trackMetric('files_list_success', executionTime, {
                fileCount: Array.isArray(result) ? result.length : 0,
                parentId: parentId || 'root',
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService?.info('Files listing completed successfully', {
                fileCount: Array.isArray(result) ? result.length : 0,
                parentId: parentId || 'root',
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files');
            
            return result;
        } catch (error) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Track failure metrics
            monitoringService?.trackMetric('files_list_failure', executionTime, {
                errorType: error.code || 'unknown',
                parentId: parentId || 'root',
                timestamp: new Date().toISOString()
            });
            
            // Create standardized error if not already one
            const mcpError = error.id ? error : errorService.createError(
                'files',
                `Failed to list files: ${error.message}`,
                'error',
                { 
                    parentId: parentId || 'root',
                    error: error.toString(),
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService?.logError(mcpError);
            
            // Rethrow the error for the caller to handle
            throw mcpError;
        }
    },
    
    /**
     * Searches files by name
     * @param {string} query - Search query
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of matching files
     */
    async searchFiles(query, req) {
        // Get services with fallbacks
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Validate input
        if (!query) {
            const err = errorService.createError(
                'files',
                'Search query is required for searchFiles',
                'error',
                { 
                    timestamp: new Date().toISOString(),
                    validationError: 'missing_query'
                }
            );
            monitoringService?.logError(err);
            monitoringService?.error('Files search validation failed: missing query', {
                validationError: 'missing_query',
                timestamp: new Date().toISOString()
            }, 'files');
            throw err;
        }
        
        // Log the request with detailed parameters
        monitoringService?.debug('Files search requested', { 
            query: this.redactSensitiveData(query),
            timestamp: new Date().toISOString(),
            source: 'files.searchFiles'
        }, 'files');
        
        try {
            // Validate that GraphService is available
            if (!graphService) {
                const err = errorService.createError(
                    'files',
                    'GraphService not available',
                    'error',
                    { 
                        timestamp: new Date().toISOString(),
                        serviceError: 'missing_graph_service'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            if (typeof graphService.searchFiles !== 'function') {
                const err = errorService.createError(
                    'files',
                    'GraphService.searchFiles not implemented',
                    'error',
                    { 
                        timestamp: new Date().toISOString(),
                        serviceError: 'missing_method'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            // Call the Graph service
            const results = await graphService.searchFiles(query, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService?.trackMetric('files_search_success', executionTime, {
                resultCount: Array.isArray(results) ? results.length : 0,
                queryLength: query.length,
                timestamp: new Date().toISOString()
            });
            
            // Log success with result summary
            monitoringService?.info('Files search completed successfully', {
                resultCount: Array.isArray(results) ? results.length : 0,
                queryLength: query.length,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'files');
            
            return results;
        } catch (error) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Track failure metrics
            monitoringService?.trackMetric('files_search_failure', executionTime, {
                errorType: error.code || 'unknown',
                queryLength: query ? query.length : 0,
                timestamp: new Date().toISOString()
            });
            
            // Create standardized error if not already one
            const mcpError = error.id ? error : errorService.createError(
                'files',
                `Failed to search files: ${error.message}`,
                'error',
                { 
                    query: this.redactSensitiveData(query),
                    error: error.toString(),
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService?.logError(mcpError);
            
            // Rethrow the error for the caller to handle
            throw mcpError;
        }
    },
    
    /**
     * Downloads a file by ID
     * @param {string} id - File ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Buffer>} File content
     */
    async downloadFile(id, req) {
        // Get services with fallbacks
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with detailed parameters
        monitoringService?.debug('File download requested', { 
            fileId: id,
            timestamp: new Date().toISOString(),
            source: 'files.downloadFile'
        }, 'files');
        
        try {
            // Validate input
            if (!id) {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'File ID is required for downloadFile',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_id'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            // Validate that GraphService is available
            if (!graphService || typeof graphService.downloadFile !== 'function') {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'GraphService.downloadFile not implemented',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        fileId: id,
                        timestamp: new Date().toISOString(),
                        serviceError: 'missing_graph_service'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            // Call the Graph service
            const result = await graphService.downloadFile(id, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService?.trackMetric('files_download_success', executionTime, {
                fileId: id,
                contentSize: result?.length || 0,
                timestamp: new Date().toISOString()
            });
            
            return result;
        } catch (error) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Track failure metrics
            monitoringService?.trackMetric('files_download_failure', executionTime, {
                errorType: error.code || 'unknown',
                fileId: id,
                timestamp: new Date().toISOString()
            });
            
            // Create standardized error if not already one
            const mcpError = error.id ? error : errorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to download file: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                { 
                    fileId: id,
                    error: error.toString(),
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService?.logError(mcpError);
            
            // Rethrow the error for the caller to handle
            throw mcpError;
        }
    },
    
    /**
     * Uploads a file to root directory
     * @param {string} name - File name
     * @param {Buffer} content - File content
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} File metadata
     */
    async uploadFile(name, content, req) {
        // Get services with fallbacks
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request with detailed parameters
        monitoringService?.debug('File upload requested', { 
            fileName: name,
            contentSize: content?.length || 0,
            timestamp: new Date().toISOString(),
            source: 'files.uploadFile'
        }, 'files');
        
        try {
            // Validate input
            if (!name) {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'File name is required for uploadFile',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_name'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            if (!content) {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'File content is required for uploadFile',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        fileName: name,
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_content'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            // Validate that GraphService is available
            if (!graphService || typeof graphService.uploadFile !== 'function') {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'GraphService.uploadFile not implemented',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        fileName: name,
                        timestamp: new Date().toISOString(),
                        serviceError: 'missing_graph_service'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            // Call the Graph service
            const result = await graphService.uploadFile(name, content, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService?.trackMetric('files_upload_success', executionTime, {
                fileName: name,
                contentSize: content?.length || 0,
                timestamp: new Date().toISOString()
            });
            
            return result;
        } catch (error) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Track failure metrics
            monitoringService?.trackMetric('files_upload_failure', executionTime, {
                errorType: error.code || 'unknown',
                fileName: name,
                contentSize: content?.length || 0,
                timestamp: new Date().toISOString()
            });
            
            // Create standardized error if not already one
            const mcpError = error.id ? error : errorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to upload file: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                { 
                    fileName: name,
                    contentSize: content?.length || 0,
                    error: error.toString(),
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService?.logError(mcpError);
            
            // Rethrow the error for the caller to handle
            throw mcpError;
        }
    },
    
    /**
     * Retrieves metadata for a file by ID
     * @param {string} id - File ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} File metadata
     */
    async getFileMetadata(id, req) {
        // Get services with fallbacks
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request
        monitoringService?.debug('File metadata requested', { 
            fileId: id,
            timestamp: new Date().toISOString(),
            source: 'files.getFileMetadata'
        }, 'files');
        
        try {
            // Validate input
            if (!id) {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'File ID is required for getFileMetadata',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_id'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            // Validate that GraphService is available
            if (!graphService || typeof graphService.getFileMetadata !== 'function') {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'GraphService.getFileMetadata not implemented',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        fileId: id,
                        timestamp: new Date().toISOString(),
                        serviceError: 'missing_graph_service'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            // Call the Graph service
            const result = await graphService.getFileMetadata(id, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService?.trackMetric('files_metadata_success', executionTime, {
                fileId: id,
                timestamp: new Date().toISOString()
            });
            
            return result;
        } catch (error) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Track failure metrics
            monitoringService?.trackMetric('files_metadata_failure', executionTime, {
                errorType: error.code || 'unknown',
                fileId: id,
                timestamp: new Date().toISOString()
            });
            
            // Create standardized error if not already one
            const mcpError = error.id ? error : errorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to get file metadata: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                { 
                    fileId: id,
                    error: error.toString(),
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService?.logError(mcpError);
            
            // Rethrow the error for the caller to handle
            throw mcpError;
        }
    },
    
    /**
     * Creates a sharing link for a file
     * @param {string} id - File ID
     * @param {string} type - Link type ('view', 'edit', etc.)
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} Sharing link
     */
    async createSharingLink(id, type = 'view', req) {
        // Get services with fallbacks
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Log the request
        monitoringService?.debug('Create sharing link requested', { 
            fileId: id,
            linkType: type,
            timestamp: new Date().toISOString(),
            source: 'files.createSharingLink'
        }, 'files');
        
        try {
            // Validate input
            if (!id) {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'File ID is required for createSharingLink',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        timestamp: new Date().toISOString(),
                        validationError: 'missing_file_id'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            // Validate that GraphService is available
            if (!graphService || typeof graphService.createSharingLink !== 'function') {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'GraphService.createSharingLink not implemented',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        fileId: id,
                        linkType: type,
                        timestamp: new Date().toISOString(),
                        serviceError: 'missing_graph_service'
                    }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            // Call the Graph service
            const result = await graphService.createSharingLink(id, type, req);
            
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            
            // Log success metrics
            monitoringService?.trackMetric('files_create_sharing_link_success', executionTime, {
                fileId: id,
                linkType: type,
                timestamp: new Date().toISOString()
            });
            
            return result;
        } catch (error) {
            // Calculate execution time even for failures
            const executionTime = Date.now() - startTime;
            
            // Track failure metrics
            monitoringService?.trackMetric('files_create_sharing_link_failure', executionTime, {
                errorType: error.code || 'unknown',
                fileId: id,
                linkType: type,
                timestamp: new Date().toISOString()
            });
            
            // Create standardized error if not already one
            const mcpError = error.id ? error : errorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to create sharing link: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                { 
                    fileId: id,
                    linkType: type,
                    error: error.toString(),
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            // Log the error
            monitoringService?.logError(mcpError);
            
            // Rethrow the error for the caller to handle
            throw mcpError;
        }
    },
    
    /**
     * Gets sharing links for a file
     * @param {string} id - File ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Array<object>>} List of sharing links
     */
    async getSharingLinks(id, req) {
        // Get services with fallbacks
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Validate input and log request
        if (!id) {
            const err = errorService.createError(
                ErrorService.CATEGORIES.VALIDATION,
                'File ID is required for getSharingLinks',
                ErrorService.SEVERITIES.ERROR,
                { timestamp: new Date().toISOString() }
            );
            monitoringService?.logError(err);
            throw err;
        }
        
        try {
            if (!graphService || typeof graphService.getSharingLinks !== 'function') {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'GraphService.getSharingLinks not implemented',
                    ErrorService.SEVERITIES.ERROR,
                    { fileId: id, timestamp: new Date().toISOString() }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            const result = await graphService.getSharingLinks(id, req);
            const executionTime = Date.now() - startTime;
            
            monitoringService?.trackMetric('files_get_sharing_links_success', executionTime, {
                fileId: id,
                linkCount: Array.isArray(result) ? result.length : 0,
                timestamp: new Date().toISOString()
            });
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            monitoringService?.trackMetric('files_get_sharing_links_failure', executionTime, {
                errorType: error.code || 'unknown',
                fileId: id,
                timestamp: new Date().toISOString()
            });
            
            const mcpError = error.id ? error : errorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to get sharing links: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                { fileId: id, error: error.toString(), stack: error.stack, timestamp: new Date().toISOString() }
            );
            
            monitoringService?.logError(mcpError);
            throw mcpError;
        }
    },
    
    /**
     * Removes a sharing permission from a file
     * @param {string} fileId - File ID
     * @param {string} permissionId - Permission ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} Result
     */
    async removeSharingPermission(fileId, permissionId, req) {
        // Get services with fallbacks
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Start tracking execution time
        const startTime = Date.now();
        
        // Validate input
        if (!fileId || !permissionId) {
            const err = errorService.createError(
                ErrorService.CATEGORIES.VALIDATION,
                'File ID and permission ID are required for removeSharingPermission',
                ErrorService.SEVERITIES.ERROR,
                { fileId, permissionId, timestamp: new Date().toISOString() }
            );
            monitoringService?.logError(err);
            throw err;
        }
        
        try {
            if (!graphService || typeof graphService.removeSharingPermission !== 'function') {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'GraphService.removeSharingPermission not implemented',
                    ErrorService.SEVERITIES.ERROR,
                    { fileId, permissionId, timestamp: new Date().toISOString() }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            const result = await graphService.removeSharingPermission(fileId, permissionId, req);
            const executionTime = Date.now() - startTime;
            
            monitoringService?.trackMetric('files_remove_sharing_permission_success', executionTime, {
                fileId, permissionId, timestamp: new Date().toISOString()
            });
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            monitoringService?.trackMetric('files_remove_sharing_permission_failure', executionTime, {
                errorType: error.code || 'unknown',
                fileId, permissionId, timestamp: new Date().toISOString()
            });
            
            const mcpError = error.id ? error : errorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to remove sharing permission: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                { fileId, permissionId, error: error.toString(), stack: error.stack, timestamp: new Date().toISOString() }
            );
            
            monitoringService?.logError(mcpError);
            throw mcpError;
        }
    },
    
    /**
     * Gets file content by ID
     * @param {string} id - File ID
     * @param {object} req - Express request object (optional)
     * @returns {Promise<Buffer>} File content
     */
    async getFileContent(id, req) {
        // Get services with fallbacks
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        const startTime = Date.now();
        
        // Validate input
        if (!id) {
            const err = errorService.createError(
                ErrorService.CATEGORIES.VALIDATION,
                'File ID is required for getFileContent',
                ErrorService.SEVERITIES.ERROR,
                { timestamp: new Date().toISOString() }
            );
            monitoringService?.logError(err);
            throw err;
        }
        
        try {
            if (!graphService || typeof graphService.getFileContent !== 'function') {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'GraphService.getFileContent not implemented',
                    ErrorService.SEVERITIES.ERROR,
                    { fileId: id, timestamp: new Date().toISOString() }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            const result = await graphService.getFileContent(id, req);
            const executionTime = Date.now() - startTime;
            
            monitoringService?.trackMetric('files_get_content_success', executionTime, {
                fileId: id, contentSize: result?.length || 0, timestamp: new Date().toISOString()
            });
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            monitoringService?.trackMetric('files_get_content_failure', executionTime, {
                errorType: error.code || 'unknown', fileId: id, timestamp: new Date().toISOString()
            });
            
            const mcpError = error.id ? error : errorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to get file content: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                { fileId: id, error: error.toString(), stack: error.stack, timestamp: new Date().toISOString() }
            );
            
            monitoringService?.logError(mcpError);
            throw mcpError;
        }
    },
    
    /**
     * Sets file content by ID
     * @param {string} id - File ID
     * @param {Buffer} content - File content
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} Updated file metadata
     */
    async setFileContent(id, content, req) {
        // Get services with fallbacks
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        const startTime = Date.now();
        
        // Validate input
        if (!id) {
            const err = errorService.createError(
                ErrorService.CATEGORIES.VALIDATION,
                'File ID is required for setFileContent',
                ErrorService.SEVERITIES.ERROR,
                { timestamp: new Date().toISOString() }
            );
            monitoringService?.logError(err);
            throw err;
        }
        
        if (!content) {
            const err = errorService.createError(
                ErrorService.CATEGORIES.VALIDATION,
                'File content is required for setFileContent',
                ErrorService.SEVERITIES.ERROR,
                { fileId: id, timestamp: new Date().toISOString() }
            );
            monitoringService?.logError(err);
            throw err;
        }
        
        try {
            if (!graphService || typeof graphService.setFileContent !== 'function') {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'GraphService.setFileContent not implemented',
                    ErrorService.SEVERITIES.ERROR,
                    { fileId: id, timestamp: new Date().toISOString() }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            const result = await graphService.setFileContent(id, content, req);
            const executionTime = Date.now() - startTime;
            
            monitoringService?.trackMetric('files_set_content_success', executionTime, {
                fileId: id, contentSize: content?.length || 0, timestamp: new Date().toISOString()
            });
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            monitoringService?.trackMetric('files_set_content_failure', executionTime, {
                errorType: error.code || 'unknown', fileId: id, contentSize: content?.length || 0, timestamp: new Date().toISOString()
            });
            
            const mcpError = error.id ? error : errorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to set file content: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                { fileId: id, contentSize: content?.length || 0, error: error.toString(), stack: error.stack, timestamp: new Date().toISOString() }
            );
            
            monitoringService?.logError(mcpError);
            throw mcpError;
        }
    },
    
    /**
     * Updates file content by ID
     * @param {string} id - File ID
     * @param {Buffer} content - File content
     * @param {object} req - Express request object (optional)
     * @returns {Promise<object>} Updated file metadata
     */
    async updateFileContent(id, content, req) {
        // Get services with fallbacks
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        const startTime = Date.now();
        
        // Validate input
        if (!id) {
            const err = errorService.createError(
                ErrorService.CATEGORIES.VALIDATION,
                'File ID is required for updateFileContent',
                ErrorService.SEVERITIES.ERROR,
                { timestamp: new Date().toISOString() }
            );
            monitoringService?.logError(err);
            throw err;
        }
        
        if (!content) {
            const err = errorService.createError(
                ErrorService.CATEGORIES.VALIDATION,
                'File content is required for updateFileContent',
                ErrorService.SEVERITIES.ERROR,
                { fileId: id, timestamp: new Date().toISOString() }
            );
            monitoringService?.logError(err);
            throw err;
        }
        
        try {
            if (!graphService || typeof graphService.updateFileContent !== 'function') {
                const err = errorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'GraphService.updateFileContent not implemented',
                    ErrorService.SEVERITIES.ERROR,
                    { fileId: id, timestamp: new Date().toISOString() }
                );
                monitoringService?.logError(err);
                throw err;
            }
            
            const result = await graphService.updateFileContent(id, content, req);
            const executionTime = Date.now() - startTime;
            
            monitoringService?.trackMetric('files_update_content_success', executionTime, {
                fileId: id, contentSize: content?.length || 0, timestamp: new Date().toISOString()
            });
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            monitoringService?.trackMetric('files_update_content_failure', executionTime, {
                errorType: error.code || 'unknown', fileId: id, contentSize: content?.length || 0, timestamp: new Date().toISOString()
            });
            
            const mcpError = error.id ? error : errorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to update file content: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                { fileId: id, contentSize: content?.length || 0, error: error.toString(), stack: error.stack, timestamp: new Date().toISOString() }
            );
            
            monitoringService?.logError(mcpError);
            throw mcpError;
        }
    },
    

/**
 * Handles file-related intents routed to this module.
 * @param {string} intent
 * @param {object} entities
 * @param {object} context
 * @returns {Promise<object>} Normalized response
 */
async handleIntent(intent, entities = {}, context = {}) {
    // Get services with fallbacks
    const { graphService, cacheService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
    
    // Start tracking execution time
    const startTime = Date.now();
    
    // Log the request with detailed parameters
    monitoringService?.debug('Files intent handling requested', { 
        intent,
        entities: this.redactSensitiveData(entities),
        timestamp: new Date().toISOString(),
        source: 'files.handleIntent'
    }, 'files');
    
    try {
        // Validate that GraphService is available
        if (!graphService) {
            const err = errorService.createError(
                'files',
                'GraphService not available',
                'error',
                { 
                    intent,
                    timestamp: new Date().toISOString(),
                    validationError: 'missing_graph_service'
                }
            );
            monitoringService?.logError(err);
            throw err;
        }
            
        let result;
            
        switch(intent) {
            case 'listFiles': {
                const parentId = entities.parentId || (typeof entities === 'string' ? entities : null);
                
                // Try to get from cache first
                const cacheKey = `files:list:${parentId || 'root'}`;
                let files = cacheService && await cacheService.get(cacheKey);
                
                if (!files) {
                    // Pass the request context if available
                    const raw = await graphService.listFiles(parentId, context.req);
                    files = Array.isArray(raw) ? raw.map(normalizeFile) : [];
                    if (cacheService) await cacheService.set(cacheKey, files, 60);
                }
                result = { type: 'fileList', items: files };
                break;
            }
            case 'searchFiles': {
                const query = entities.query || (typeof entities === 'string' ? entities : '');
                
                if (!query) {
                    // Log warning for missing query parameter
                    monitoringService?.warn('searchFiles intent called without query parameter', {
                        intent,
                        timestamp: new Date().toISOString()
                    }, 'files');
                    result = { type: 'fileList', items: [] };
                    break;
                }
                
                // Log search request
                monitoringService?.debug('Handling searchFiles intent', {
                    query,
                    timestamp: new Date().toISOString()
                }, 'files');
                
                // Try to get from cache first
                const cacheKey = `files:search:${query}`;
                let results = cacheService && await cacheService.get(cacheKey);
                
                if (!results) {
                    monitoringService?.debug('Cache miss for search query', {
                        query,
                        timestamp: new Date().toISOString()
                    }, 'files');
                    
                    try {
                        // Pass the request context if available
                        const raw = await graphService.searchFiles(query, context.req);
                        results = Array.isArray(raw) ? raw.map(normalizeFile) : [];
                        
                        // Cache the results
                        if (cacheService) {
                            await cacheService.set(cacheKey, results, 60);
                            monitoringService?.debug('Cached search results', {
                                query,
                                resultCount: results.length,
                                timestamp: new Date().toISOString()
                            }, 'files');
                        }
                    } catch (error) {
                        // Log the search error
                        const searchError = errorService.createError(
                            'files',
                            `Error searching files: ${error.message}`,
                            'error',
                            { 
                                query,
                                error: error.toString(),
                                stack: error.stack,
                                timestamp: new Date().toISOString()
                            }
                        );
                        monitoringService?.logError(searchError);
                        results = []; // Return empty array on error
                    }
                } else {
                    monitoringService?.debug('Cache hit for search query', {
                        query,
                        resultCount: results.length,
                        timestamp: new Date().toISOString()
                    }, 'files');
                }
                
                result = { type: 'fileList', items: results };
                break;
            }
            case 'downloadFile': {
                const { fileId } = entities;
                const file = await graphService.downloadFile(fileId);
                result = { type: 'fileDownload', fileId, content: file };
                break;
            }
            case 'uploadFile': {
                const { name, content } = entities;
                const uploadResult = await graphService.uploadFile(name, content);
                result = { type: 'fileUploadResult', file: normalizeFile(uploadResult) };
                break;
            }
            case 'getFileMetadata': {
                const { fileId } = entities;
                const meta = await graphService.getFileMetadata(fileId);
                result = { type: 'fileMetadata', file: normalizeFile(meta) };
                break;
            }
            case 'createSharingLink': {
                const { fileId, type } = entities;
                const link = await graphService.createSharingLink(fileId, type);
                result = { type: 'sharingLink', link };
                break;
            }
            case 'getSharingLinks': {
                const { fileId } = entities;
                const links = await graphService.getSharingLinks(fileId);
                result = { type: 'sharingLinks', links };
                break;
            }
            case 'removeSharingPermission': {
                const { fileId, permissionId } = entities;
                const permResult = await graphService.removeSharingPermission(fileId, permissionId);
                result = { type: 'removeSharingPermissionResult', result: permResult };
                break;
            }
            case 'getFileContent': {
                const { fileId } = entities;
                const content = await graphService.getFileContent(fileId);
                result = { type: 'fileContent', fileId, content };
                break;
            }
            case 'setFileContent': {
                const { fileId, content } = entities;
                const setResult = await graphService.setFileContent(fileId, content);
                result = { type: 'setFileContentResult', file: normalizeFile(setResult) };
                break;
            }
            case 'updateFileContent': {
                const { fileId, content } = entities;
                const updateResult = await graphService.updateFileContent(fileId, content);
                result = { type: 'updateFileContentResult', file: normalizeFile(updateResult) };
                break;
            }
            default: {
                // Create a standardized error for unsupported intent
                const unsupportedError = errorService.createError(
                    'files',
                    `The files module does not support the intent: ${intent}`,
                    'warn',
                    { 
                        intent, 
                        moduleId: this.id,
                        timestamp: new Date().toISOString()
                    }
                );
                
                monitoringService?.logError(unsupportedError);
                monitoringService?.warn(`Unsupported files intent received: ${intent}`, {
                    intent,
                    timestamp: new Date().toISOString()
                }, 'files');
                    
                // Track metric for unsupported intent
                monitoringService?.trackMetric('files_unsupported_intent', 1, {
                    intent,
                    timestamp: new Date().toISOString()
                });
                
                throw unsupportedError; // Throw error to signal unsupported operation
            }
        }
            
        // Calculate execution time
        const executionTime = Date.now() - startTime;
            
        // Log success metrics
        monitoringService?.trackMetric('files_intent_success', executionTime, {
            intent,
            timestamp: new Date().toISOString()
        });
            
        // Log success with result summary
        monitoringService?.info('Files intent handled successfully', {
            intent,
            executionTimeMs: executionTime,
            timestamp: new Date().toISOString()
        }, 'files');
            
        return result;
    } catch (error) {
        // Calculate execution time even for failures
        const executionTime = Date.now() - startTime;
            
        // Track failure metrics
        monitoringService?.trackMetric('files_intent_failure', executionTime, {
            intent,
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
            
        // Create standardized error if not already one
        const mcpError = error.id ? error : errorService.createError(
            'files',
            `Failed to handle files intent: ${error.message}`,
            'error',
            { 
                intent,
                entities: this.redactSensitiveData(entities),
                error: error.toString(),
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
            
        // Log the error
        monitoringService?.logError(mcpError);
            
        // Rethrow the error for the caller to handle
        throw mcpError;
        }
    }
};

module.exports = FilesModule;
