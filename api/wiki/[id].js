/**
 * GET    /api/wiki/[id] — Get page content.
 * PUT    /api/wiki/[id] — Update page title and/or content.
 * DELETE /api/wiki/[id] — Delete a page (admin only).
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

    var id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Page ID required' });

    // ── GET — get page with content ──
    if (req.method === 'GET') {
      var pagesData = await github.getPages();
      var meta = pagesData.pages.find(function (p) { return p.id === id; });
      if (!meta) return res.status(404).json({ error: 'Page not found' });

      var contentFile = await github.getPageContent(id);
      return res.status(200).json({
        id: meta.id,
        title: meta.title,
        parentId: meta.parentId,
        order: meta.order,
        createdBy: meta.createdBy,
        updatedBy: meta.updatedBy,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        content: contentFile ? contentFile.content : '',
      });
    }

    // ── PUT — update page ──
    if (req.method === 'PUT') {
      if (role !== 'admin' && role !== 'editor') {
        return res.status(403).json({ error: 'Editor access required' });
      }

      var body = req.body || {};
      var pagesData = await github.getPages();
      var idx = pagesData.pages.findIndex(function (p) { return p.id === id; });
      if (idx === -1) return res.status(404).json({ error: 'Page not found' });

      // Update metadata
      if (body.title) pagesData.pages[idx].title = body.title;
      if (typeof body.order === 'number') pagesData.pages[idx].order = body.order;
      pagesData.pages[idx].updatedBy = session.login;
      pagesData.pages[idx].updatedAt = new Date().toISOString();
      await github.savePages(pagesData.pages, pagesData.sha);

      // Update content
      if (body.content !== undefined) {
        var existing = await github.getPageContent(id);
        await github.savePageContent(id, body.content, existing ? existing.sha : null);
      }

      return res.status(200).json({ page: pagesData.pages[idx] });
    }

    // ── DELETE — delete page (admin only) ──
    if (req.method === 'DELETE') {
      if (role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      var pagesData = await github.getPages();
      var hasChildren = pagesData.pages.some(function (p) { return p.parentId === id; });
      if (hasChildren) {
        return res.status(400).json({ error: 'Cannot delete page with sub-pages. Remove children first.' });
      }

      var idx = pagesData.pages.findIndex(function (p) { return p.id === id; });
      if (idx === -1) return res.status(404).json({ error: 'Page not found' });

      // Remove from index
      pagesData.pages.splice(idx, 1);
      await github.savePages(pagesData.pages, pagesData.sha);

      // Delete content file
      var contentFile = await github.getPageContent(id);
      if (contentFile) {
        await github.deletePageFile(id, contentFile.sha);
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('wiki/[id] error:', e);
    return res.status(500).json({ error: 'Internal error: ' + e.message });
  }
};
