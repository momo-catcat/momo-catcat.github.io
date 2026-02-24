/**
 * GitHub API utilities for the wiki data repository.
 *
 * Environment variables:
 *   GITHUB_TOKEN       — Fine-grained PAT with read/write access to the wiki repo
 *   WIKI_REPO          — "owner/repo" for the private wiki data repository
 *   GITHUB_CLIENT_ID   — OAuth App client ID
 *   GITHUB_CLIENT_SECRET — OAuth App client secret
 *   ADMIN_GITHUB_LOGIN — GitHub username of the primary admin
 *   SITE_URL           — Public URL of the site (e.g. https://www.xuchenghe.science)
 */

const GITHUB_API = 'https://api.github.com';

function getConfig() {
  return {
    token: process.env.GITHUB_TOKEN,
    repo: process.env.WIKI_REPO,
    adminLogin: (process.env.ADMIN_GITHUB_LOGIN || '').toLowerCase(),
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    siteUrl: process.env.SITE_URL || '',
  };
}

// ─── Low-level GitHub API ────────────────────────────────────

async function ghFetch(method, path, body) {
  var token = getConfig().token;
  var opts = {
    method: method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'group-wiki',
    },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return fetch(GITHUB_API + path, opts);
}

// ─── File Operations ─────────────────────────────────────────

async function getFile(path) {
  var repo = getConfig().repo;
  var res = await ghFetch('GET', '/repos/' + repo + '/contents/' + path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub API error: ' + res.status);
  var data = await res.json();
  return {
    content: Buffer.from(data.content, 'base64').toString('utf-8'),
    sha: data.sha,
  };
}

async function getFileRaw(path) {
  var cfg = getConfig();
  var res = await fetch(GITHUB_API + '/repos/' + cfg.repo + '/contents/' + path, {
    headers: {
      Authorization: 'Bearer ' + cfg.token,
      Accept: 'application/vnd.github.v3.raw',
      'User-Agent': 'group-wiki',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub API error (raw): ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function putFile(path, content, sha, message) {
  var repo = getConfig().repo;
  var body = {
    message: message || 'Update ' + path,
    content: Buffer.from(content).toString('base64'),
  };
  if (sha) body.sha = sha;
  var res = await ghFetch('PUT', '/repos/' + repo + '/contents/' + path, body);
  if (!res.ok) {
    var detail = await res.text();
    throw new Error('GitHub PUT error ' + res.status + ': ' + detail);
  }
  return res.json();
}

async function deleteFile(path, sha, message) {
  var repo = getConfig().repo;
  var res = await ghFetch('DELETE', '/repos/' + repo + '/contents/' + path, {
    message: message || 'Delete ' + path,
    sha: sha,
  });
  if (!res.ok) {
    var detail = await res.text();
    throw new Error('GitHub DELETE error ' + res.status + ': ' + detail);
  }
}

// ─── Users ───────────────────────────────────────────────────

async function getUsers() {
  var file = await getFile('users.json');
  if (!file) return { users: {}, sha: null };
  try {
    return { users: JSON.parse(file.content), sha: file.sha };
  } catch (e) {
    return { users: {}, sha: file.sha };
  }
}

async function saveUsers(users, sha) {
  return putFile('users.json', JSON.stringify(users, null, 2), sha, 'Update users');
}

/**
 * Get a user's role. Returns role string or null if not in the system.
 * Auto-creates the admin user if ADMIN_GITHUB_LOGIN matches.
 */
async function getUserRole(login) {
  var key = login.toLowerCase();
  var adminLogin = getConfig().adminLogin;
  var data = await getUsers();
  var users = data.users;
  var sha = data.sha;

  // Admin override — always admin
  if (key === adminLogin && adminLogin) {
    if (!users[key] || users[key].role !== 'admin') {
      users[key] = {
        role: 'admin',
        displayName: login,
        addedAt: new Date().toISOString(),
      };
      try { await saveUsers(users, sha); } catch (e) { /* ignore race */ }
    }
    return 'admin';
  }

  return users[key] ? users[key].role : null;
}

// ─── Pages ───────────────────────────────────────────────────

async function getPages() {
  var file = await getFile('pages.json');
  if (!file) return { pages: [], sha: null };
  try {
    return { pages: JSON.parse(file.content), sha: file.sha };
  } catch (e) {
    return { pages: [], sha: file.sha };
  }
}

async function savePages(pages, sha) {
  return putFile('pages.json', JSON.stringify(pages, null, 2), sha, 'Update pages index');
}

async function getPageContent(pageId) {
  return getFile('pages/' + pageId + '.md');
}

async function savePageContent(pageId, content, sha) {
  return putFile('pages/' + pageId + '.md', content, sha || undefined, 'Update page ' + pageId);
}

async function deletePageFile(pageId, sha) {
  return deleteFile('pages/' + pageId + '.md', sha, 'Delete page ' + pageId);
}

// ─── Image Upload ────────────────────────────────────────────

async function uploadImage(filename, base64Content) {
  var path = 'uploads/' + filename;
  var existing = await getFile(path);
  var body = {
    message: 'Upload image ' + filename,
    content: base64Content, // already base64
  };
  if (existing) body.sha = existing.sha;
  var repo = getConfig().repo;
  var res = await ghFetch('PUT', '/repos/' + repo + '/contents/' + path, body);
  if (!res.ok) {
    var detail = await res.text();
    throw new Error('Upload error ' + res.status + ': ' + detail);
  }
  return res.json();
}

module.exports = {
  getConfig,
  getFile,
  getFileRaw,
  putFile,
  deleteFile,
  getUsers,
  saveUsers,
  getUserRole,
  getPages,
  savePages,
  getPageContent,
  savePageContent,
  deletePageFile,
  uploadImage,
};
