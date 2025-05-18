/**
 * @fileoverview FilesService - Microsoft Graph Files (OneDrive) API operations.
 * All methods are async, modular, and use GraphClient for requests.
 * Follows project error handling, validation, and normalization rules.
 */

const graphClientFactory = require('./graph-client.cjs');
const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');

/**
 * Normalizes a file object from Graph API to a standard format
 * @param {Object} graphFile - File object from Graph API
 * @returns {Object} Normalized file object
 */
function normalizeFile(graphFile) {
  return {
    id: graphFile.id,
    name: graphFile.name,
    size: graphFile.size,
    lastModified: graphFile.lastModifiedDateTime,
    isFolder: !!graphFile.folder,
    webUrl: graphFile.webUrl
  };
}

/**
 * Redacts sensitive data from objects before logging
 * @param {Object} data - The data object to redact
 * @returns {Object} Redacted copy of the data
 * @private
 */
function redactSensitiveData(data) {
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
        result[key] = redactSensitiveData(result[key]);
      }
    }
  }
  
  return result;
}

/**
 * Lists files and folders in a directory (defaults to root).
 * @param {string} [parentId]
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>}
 */
async function listFiles(parentId, req) {
  const errorService = ErrorService;
  const monitoringService = MonitoringService;
  
  // Start tracking execution time
  const startTime = Date.now();
  
  // Log the request with detailed parameters
  monitoringService.debug('Files listing requested', { 
    parentId: parentId || 'root',
    timestamp: new Date().toISOString(),
    source: 'files.listFiles'
  }, 'files');
  
  try {
    const client = await graphClientFactory.createClient(req);
    const path = parentId ? `/me/drive/items/${parentId}/children` : '/me/drive/root/children';
    
    monitoringService.debug('Calling Graph API for files listing', {
      path,
      timestamp: new Date().toISOString()
    }, 'files');
    
    const res = await client.api(path).get();
    
    // Calculate execution time
    const executionTime = Date.now() - startTime;
    
    // Log success metrics
    monitoringService.trackMetric('files_list_success', executionTime, {
      fileCount: res.value ? res.value.length : 0,
      parentId: parentId || 'root',
      timestamp: new Date().toISOString()
    });
    
    // Log success with result summary
    monitoringService.info('Files listing completed successfully', {
      fileCount: res.value ? res.value.length : 0,
      parentId: parentId || 'root',
      executionTimeMs: executionTime,
      timestamp: new Date().toISOString()
    }, 'files');
    
    return (res.value || []).map(normalizeFile);
  } catch (error) {
    // Calculate execution time even for failures
    const executionTime = Date.now() - startTime;
    
    // Track failure metrics
    monitoringService.trackMetric('files_list_failure', executionTime, {
      errorType: error.code || 'unknown',
      parentId: parentId || 'root',
      timestamp: new Date().toISOString()
    });
    
    // Create standardized error
    const mcpError = errorService.createError(
      'graph',
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
    monitoringService.logError(mcpError);
    
    // Rethrow the error for the caller to handle
    throw mcpError;
  }
}

/**
 * Searches files by name.
 * @param {string} query
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>}
 */
async function searchFiles(query, req) {
  const errorService = ErrorService;
  const monitoringService = MonitoringService;
  
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
    monitoringService.logError(err);
    monitoringService.error('Files search validation failed: missing query', {
      validationError: 'missing_query',
      timestamp: new Date().toISOString()
    }, 'files');
    throw err;
  }
  
  // Log the request with detailed parameters
  monitoringService.debug('Files search requested', { 
    query: redactSensitiveData(query),
    timestamp: new Date().toISOString(),
    source: 'files.searchFiles'
  }, 'files');
  
  try {
    const client = await graphClientFactory.createClient(req);
    const searchUrl = `/me/drive/root/search(q='${encodeURIComponent(query)}')`;
    
    monitoringService.debug('Calling Graph API for files search', {
      searchUrl: redactSensitiveData(searchUrl),
      timestamp: new Date().toISOString()
    }, 'files');
    
    const res = await client.api(searchUrl).get();
    
    // Calculate execution time
    const executionTime = Date.now() - startTime;
    
    // Log success metrics
    monitoringService.trackMetric('files_search_success', executionTime, {
      resultCount: res.value ? res.value.length : 0,
      queryLength: query.length,
      timestamp: new Date().toISOString()
    });
    
    // Log success with result summary
    monitoringService.info('Files search completed successfully', {
      resultCount: res.value ? res.value.length : 0,
      queryLength: query.length,
      executionTimeMs: executionTime,
      timestamp: new Date().toISOString()
    }, 'files');
    
    const normalizedResults = (res.value || []).map(normalizeFile);
    return normalizedResults;
  } catch (error) {
    // Calculate execution time even for failures
    const executionTime = Date.now() - startTime;
    
    // Track failure metrics
    monitoringService.trackMetric('files_search_failure', executionTime, {
      errorType: error.code || 'unknown',
      queryLength: query.length,
      timestamp: new Date().toISOString()
    });
    
    // Create standardized error
    const mcpError = errorService.createError(
      'graph',
      `Failed to search files: ${error.message}`,
      'error',
      { 
        query: redactSensitiveData(query),
        error: error.toString(),
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    // Log the error
    monitoringService.logError(mcpError);
    
    // Rethrow the error for the caller to handle
    throw mcpError;
  }
}

/**
 * Downloads a file by ID.
 * @param {string} id
 * @param {object} req - Express request object
 * @returns {Promise<Buffer>}
 */
async function downloadFile(id, req) {
  const errorService = ErrorService;
  const monitoringService = MonitoringService;
  
  // Start tracking execution time
  const startTime = Date.now();
  
  // Validate input
  if (!id) {
    const err = errorService.createError(
      'files',
      'File ID is required for downloadFile',
      'error',
      { 
        timestamp: new Date().toISOString(),
        validationError: 'missing_file_id'
      }
    );
    monitoringService.logError(err);
    monitoringService.error('Files download validation failed: missing file ID', {
      validationError: 'missing_file_id',
      timestamp: new Date().toISOString()
    }, 'files');
    throw err;
  }
  
  // Log the request with detailed parameters
  monitoringService.debug('File download requested', { 
    fileId: id,
    timestamp: new Date().toISOString(),
    source: 'files.downloadFile'
  }, 'files');
  
  try {
    const client = await graphClientFactory.createClient(req);
    
    monitoringService.debug('Calling Graph API for file download', {
      fileId: id,
      timestamp: new Date().toISOString()
    }, 'files');
    
    const content = await client.api(`/me/drive/items/${id}/content`).get();
    
    // Calculate execution time
    const executionTime = Date.now() - startTime;
    
    // Log success metrics
    monitoringService.trackMetric('file_download_success', executionTime, {
      fileId: id,
      contentSize: content ? content.length : 0,
      timestamp: new Date().toISOString()
    });
    
    // Log success with result summary
    monitoringService.info('File download completed successfully', {
      fileId: id,
      contentSize: content ? content.length : 0,
      executionTimeMs: executionTime,
      timestamp: new Date().toISOString()
    }, 'files');
    
    return content;
  } catch (error) {
    // Calculate execution time even for failures
    const executionTime = Date.now() - startTime;
    
    // Track failure metrics
    monitoringService.trackMetric('file_download_failure', executionTime, {
      errorType: error.code || 'unknown',
      fileId: id,
      timestamp: new Date().toISOString()
    });
    
    // Create standardized error
    const mcpError = errorService.createError(
      'graph',
      `Failed to download file: ${error.message}`,
      'error',
      { 
        fileId: id,
        error: error.toString(),
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    // Log the error
    monitoringService.logError(mcpError);
    
    // Rethrow the error for the caller to handle
    throw mcpError;
  }
}

/**
 * Uploads a file to root directory.
 * @param {string} name - The name of the file to upload
 * @param {string|Buffer} content - The content of the file
 * @param {object} req - Express request object for authentication
 * @returns {Promise<object>} - The uploaded file metadata
 */
async function uploadFile(name, content, req) {
  try {
    console.log(`[FilesService] Uploading file: ${name}, size: ${content.length || 'unknown'}`);
    
    // Ensure we have a valid client with authentication
    const client = await graphClientFactory.createClient(req);
    
    // Convert string content to Buffer if needed
    const contentBuffer = typeof content === 'string' ? Buffer.from(content) : content;
    
    // Make the API call to upload the file
    const result = await client.api(`/me/drive/root:/${encodeURIComponent(name)}:/content`).put(contentBuffer);
    
    console.log(`[FilesService] File uploaded successfully: ${name}, ID: ${result.id}`);
    return result;
  } catch (error) {
    console.error(`[FilesService] Error uploading file ${name}: ${error.message}`);
    
    // Create a standardized error using the ErrorService
    const mcpError = ErrorService.createError(
      ErrorService.CATEGORIES.GRAPH,
      `Failed to upload file: ${error.message}`,
      ErrorService.SEVERITIES.ERROR,
      {
        fileName: name,
        fileSize: content.length || 'unknown',
        graphErrorCode: error.code || 'unknown',
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    // Log the error with the MonitoringService
    MonitoringService.logError(mcpError);
    
    // Rethrow the error for the caller to handle
    throw mcpError;
  }
}

/**
 * Retrieves metadata for a file by ID.
 * @param {string} id
 * @returns {Promise<object>}
 */
async function getFileMetadata(id) {
  const client = await graphClientFactory.createClient();
  const meta = await client.api(`/me/drive/items/${id}`).get();
  return normalizeFile(meta);
}

/**
 * Creates a sharing link for a file.
 * @param {string} id
 * @param {string} type - 'view', 'edit', etc.
 * @returns {Promise<object>} Normalized sharing link
 */
async function createSharingLink(id, type = 'view') {
  const client = await graphClientFactory.createClient();
  const body = { type, scope: 'anonymous' };
  const res = await client.api(`/me/drive/items/${id}/createLink`).post(body);
  return res.link ? { webUrl: res.link.webUrl } : {};
}

/**
 * Gets sharing links (permissions) for a file.
 * @param {string} id
 * @returns {Promise<Array<object>>} Array of normalized sharing links
 */
async function getSharingLinks(id) {
  const client = await graphClientFactory.createClient();
  const res = await client.api(`/me/drive/items/${id}/permissions`).get();
  return (res.value || [])
    .filter(p => p.link && p.link.webUrl)
    .map(p => ({ id: p.id, webUrl: p.link.webUrl, type: p.link.type }));
}

/**
 * Removes a sharing permission from a file.
 * @param {string} fileId
 * @param {string} permissionId
 * @returns {Promise<object>}
 */
async function removeSharingPermission(fileId, permissionId) {
  const client = await graphClientFactory.createClient();
  return await client.api(`/me/drive/items/${fileId}/permissions/${permissionId}`).delete();
}

/**
 * Gets file content by ID from OneDrive/SharePoint
 * @param {string} id - The file ID to retrieve
 * @param {object} req - Express request object
 * @returns {Promise<{content: Buffer, contentType: string}>} File content and content type
 */
async function getFileContent(id, req) {
  const errorService = ErrorService;
  const monitoringService = MonitoringService;
  
  // Start tracking execution time
  const startTime = Date.now();
  
  // Validate input
  if (!id) {
    const err = errorService.createError(
      'files',
      'File ID is required for getFileContent',
      'error',
      { 
        timestamp: new Date().toISOString(),
        validationError: 'missing_file_id'
      }
    );
    monitoringService.logError(err);
    monitoringService.error('File content retrieval validation failed: missing file ID', {
      validationError: 'missing_file_id',
      timestamp: new Date().toISOString()
    }, 'files');
    throw err;
  }
  
  // Log the request with detailed parameters
  monitoringService.debug('File content requested', { 
    fileId: id,
    timestamp: new Date().toISOString(),
    source: 'files.getFileContent'
  }, 'files');
  
  try {
    const client = await graphClientFactory.createClient(req);
    
    monitoringService.debug('Calling Graph API for file metadata', {
      fileId: id,
      timestamp: new Date().toISOString()
    }, 'files');
    
    // First get file metadata to determine content type
    const fileMetadata = await client.api(`/me/drive/items/${id}`).get();
    const contentType = fileMetadata.file ? fileMetadata.file.mimeType : 'application/octet-stream';
    
    monitoringService.debug('Calling Graph API for file content', {
      fileId: id,
      contentType,
      timestamp: new Date().toISOString()
    }, 'files');
    
    // Get the actual file content
    const content = await client.api(`/me/drive/items/${id}/content`).get();
    
    // Calculate execution time
    const executionTime = Date.now() - startTime;
    
    // Log success metrics
    monitoringService.trackMetric('file_content_success', executionTime, {
      fileId: id,
      contentType,
      contentSize: content ? content.length : 0,
      timestamp: new Date().toISOString()
    });
    
    // Log success with result summary
    monitoringService.info('File content retrieved successfully', {
      fileId: id,
      contentType,
      contentSize: content ? content.length : 0,
      executionTimeMs: executionTime,
      timestamp: new Date().toISOString()
    }, 'files');
    
    // Return both the content and content type
    return {
      content: content,
      contentType: contentType
    };
  } catch (error) {
    // Calculate execution time even for failures
    const executionTime = Date.now() - startTime;
    
    // Track failure metrics
    monitoringService.trackMetric('file_content_failure', executionTime, {
      errorType: error.code || 'unknown',
      fileId: id,
      timestamp: new Date().toISOString()
    });
    
    // Create standardized error
    const mcpError = errorService.createError(
      'graph',
      `Failed to get file content: ${error.message}`,
      'error',
      { 
        fileId: id,
        error: error.toString(),
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    
    // Log the error
    monitoringService.logError(mcpError);
    
    // Rethrow the error for the caller to handle
    throw mcpError;
  }
}

/**
 * Overwrites file content by ID.
 * @param {string} id
 * @param {Buffer} content
 * @returns {Promise<object>}
 */
async function setFileContent(id, content) {
  const client = await graphClientFactory.createClient();
  return await client.api(`/me/drive/items/${id}/content`).put(content);
}

/**
 * Updates file content by ID using PUT method as required by Microsoft Graph API.
 * @param {string} id
 * @param {Buffer} content
 * @returns {Promise<object>}
 */
async function updateFileContent(id, content) {
  try {
    const client = await graphClientFactory.createClient();
    // Use PUT for file content updates as per Graph API documentation
    return await client.api(`/me/drive/items/${id}/content`).put(content);
  } catch (error) {
    // Add specific error handling for file content updates
    MonitoringService.error(`Failed to update file content: ${error.message}`, {
      fileId: id,
      errorCode: error.statusCode || error.code,
      errorMessage: error.message,
      timestamp: new Date().toISOString()
    }, 'graph');
    throw error;
  }
}

module.exports = {
  listFiles,
  searchFiles,
  downloadFile,
  uploadFile,
  getFileMetadata,
  createSharingLink,
  getSharingLinks,
  removeSharingPermission,
  getFileContent,
  setFileContent,
  updateFileContent
};
