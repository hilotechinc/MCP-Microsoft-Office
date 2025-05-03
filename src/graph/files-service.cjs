/**
 * @fileoverview FilesService - Microsoft Graph Files (OneDrive) API operations.
 * All methods are async, modular, and use GraphClient for requests.
 * Follows project error handling, validation, and normalization rules.
 */

const graphClientFactory = require('./graph-client.cjs');

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
 * Lists files and folders in a directory (defaults to root).
 * @param {string} [parentId]
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>}
 */
async function listFiles(parentId, req) {
  const client = await graphClientFactory.createClient(req);
  const path = parentId ? `/me/drive/items/${parentId}/children` : '/me/drive/root/children';
  const res = await client.api(path).get();
  return (res.value || []).map(normalizeFile);
}

/**
 * Searches files by name.
 * @param {string} query
 * @param {object} req - Express request object
 * @returns {Promise<Array<object>>}
 */
async function searchFiles(query, req) {
  try {
    console.log(`[Files Service] Searching for files with query: ${query}`);
    const client = await graphClientFactory.createClient(req);
    const searchUrl = `/me/drive/root/search(q='${encodeURIComponent(query)}')`;
    console.log(`[Files Service] Using search URL: ${searchUrl}`);
    
    const res = await client.api(searchUrl).get();
    console.log(`[Files Service] Search response received with ${res.value ? res.value.length : 0} results`);
    
    const normalizedResults = (res.value || []).map(normalizeFile);
    return normalizedResults;
  } catch (error) {
    console.error(`[Files Service] Error searching files with query "${query}":`, error);
    throw error; // Rethrow to allow controller to handle fallback
  }
}

/**
 * Downloads a file by ID.
 * @param {string} id
 * @param {object} req - Express request object
 * @returns {Promise<Buffer>}
 */
async function downloadFile(id, req) {
  const client = await graphClientFactory.createClient(req);
  // For download, Graph API returns a redirect URL. Here we just simulate.
  return await client.api(`/me/drive/items/${id}/content`).get();
}

/**
 * Uploads a file to root directory.
 * @param {string} name
 * @param {Buffer} content
 * @returns {Promise<object>}
 */
async function uploadFile(name, content) {
  const client = await graphClientFactory.createClient();
  return await client.api(`/me/drive/root:/${encodeURIComponent(name)}:/content`).put(content);
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
  const client = await graphClientFactory.createClient(req);
  
  // First get file metadata to determine content type
  const fileMetadata = await client.api(`/me/drive/items/${id}`).get();
  const contentType = fileMetadata.file ? fileMetadata.file.mimeType : 'application/octet-stream';
  
  // Get the actual file content
  const content = await client.api(`/me/drive/items/${id}/content`).get();
  
  // Return both the content and content type
  return {
    content: content,
    contentType: contentType
  };
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
 * Updates (patches) file content by ID (for demonstration; Graph API typically uses PUT for overwrite).
 * @param {string} id
 * @param {Buffer} content
 * @returns {Promise<object>}
 */
async function updateFileContent(id, content) {
  const client = await graphClientFactory.createClient();
  // PATCH is not standard for file content, but for demonstration/testing
  return await client.api(`/me/drive/items/${id}/content`).patch(content);
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
