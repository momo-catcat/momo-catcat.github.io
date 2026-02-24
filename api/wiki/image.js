/**
 * GET /api/wiki/image?path=uploads/filename.jpg
 * Proxies image files from the private wiki data repo.
 */
var auth = require('../_lib/auth');
var github = require('../_lib/github');

var MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

module.exports = async function (req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var session = auth.getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  try {
    var path = req.query.path;
    if (!path || !path.startsWith('uploads/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    var buffer = await github.getFileRaw(path);
    if (!buffer) return res.status(404).json({ error: 'Image not found' });

    var ext = path.split('.').pop().toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (e) {
    console.error('image proxy error:', e);
    return res.status(500).json({ error: 'Failed to load image' });
  }
};
