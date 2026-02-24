/**
 * GET  /api/wiki/pages — List all page metadata.
 * POST /api/wiki/pages — Create a new page.
 */
var auth = require('../_lib/auth');
var github = require('../_lib/github');

module.exports = async function (req, res) {
  var session = auth.getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  try {
    var role = await github.getUserRole(session.login);
    if (!role || role === 'pending') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // ── GET — list all pages ──
    if (req.method === 'GET') {
      var data = await github.getPages();
      return res.status(200).json({ pages: data.pages });
    }

    // ── POST — create new page ──
    if (req.method === 'POST') {
      if (role !== 'admin' && role !== 'editor') {
        return res.status(403).json({ error: 'Editor access required' });
      }

      var body = req.body || {};
      var title = body.title;
      if (!title) return res.status(400).json({ error: 'Title is required' });

      var id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
      var now = new Date().toISOString();
      var pageMeta = {
        id: id,
        title: title,
        parentId: body.parentId || null,
        order: typeof body.order === 'number' ? body.order : 0,
        createdBy: session.login,
        updatedBy: session.login,
        createdAt: now,
        updatedAt: now,
      };

      // Add to pages index
      var data = await github.getPages();
      data.pages.push(pageMeta);
      await github.savePages(data.pages, data.sha);

      // Create content file
      await github.savePageContent(id, body.content || '');

      return res.status(201).json({ page: pageMeta });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('wiki/pages error:', e);
    return res.status(500).json({ error: 'Internal error: ' + e.message });
  }
};
