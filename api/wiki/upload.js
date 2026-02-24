/**
 * POST /api/wiki/upload — Upload an image to the wiki data repo.
 * Body: { filename: string, content: base64-string }
 * Returns: { url: "/api/wiki/image?path=uploads/..." }
 */
var auth = require('../_lib/auth');
var github = require('../_lib/github');

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var session = auth.getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  try {
    var role = await github.getUserRole(session.login);
    if (role !== 'admin' && role !== 'editor') {
      return res.status(403).json({ error: 'Editor access required' });
    }

    var body = req.body || {};
    if (!body.filename || !body.content) {
      return res.status(400).json({ error: 'filename and content (base64) required' });
    }

    // Sanitize filename
    var safeName = Date.now() + '_' + body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    await github.uploadImage(safeName, body.content);

    var imageUrl = '/api/wiki/image?path=uploads/' + encodeURIComponent(safeName);
    return res.status(200).json({ url: imageUrl, filename: safeName });
  } catch (e) {
    console.error('upload error:', e);
    return res.status(500).json({ error: 'Upload failed: ' + e.message });
  }
};
