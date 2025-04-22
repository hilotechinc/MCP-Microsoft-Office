/**
 * @fileoverview FilesService - Microsoft Graph Files (OneDrive) API operations.
 * All methods are async, modular, and use GraphClient for requests.
 * Follows project error handling, validation, and normalization rules.
 */

const graphClientFactory = require('./graph-client');

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
 * @returns {Promise<Array<object>>}
 */
async function listFiles(parentId) {
  const client = await graphClientFactory.createClient();
  const path = parentId ? `/me/drive/items/${parentId}/children` : '/me/drive/root/children';
  const res = await client.api(path).get();
  return (res.value || []).map(normalizeFile);
}

/**
 * Searches files by name.
 * @param {string} query
 * @returns {Promise<Array<object>>}
 */
async function searchFiles(query) {
  const client = await graphClientFactory.createClient();
  const res = await client.api(`/me/drive/root/search(q='${encodeURIComponent(query)}')`).get();
  return (res.value || []).map(normalizeFile);
}

/**
 * Downloads a file by ID.
 * @param {string} id
 * @returns {Promise<Buffer>}
 */
async function downloadFile(id) {
  const client = await graphClientFactory.createClient();
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
 * Downloads file content by ID (alias for downloadFile).
 * @param {string} id
 * @returns {Promise<Buffer>}
 */
async function getFileContent(id) {
  return await downloadFile(id);
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
