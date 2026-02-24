/**
 * GET    /api/admin/users              — List all users.
 * POST   /api/admin/users              — Add a user { login, role, displayName }.
 * PUT    /api/admin/users?login=xxx    — Update user role { role }.
 * DELETE /api/admin/users?login=xxx    — Remove a user.
 */
var auth = require('../_lib/auth');
var github = require('../_lib/github');

module.exports = async function (req, res) {
  var session = auth.getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  try {
    var role = await github.getUserRole(session.login);
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // ── GET — list users ──
    if (req.method === 'GET') {
      var data = await github.getUsers();
      return res.status(200).json({ users: data.users });
    }

    // ── POST — add / invite user ──
    if (req.method === 'POST') {
      var body = req.body || {};
      var login = body.login;
      var newRole = body.role;
      if (!login || !newRole) {
        return res.status(400).json({ error: 'login and role are required' });
      }
      if (['viewer', 'editor', 'admin'].indexOf(newRole) === -1) {
        return res.status(400).json({ error: 'Invalid role. Use: viewer, editor, admin' });
      }

      var data = await github.getUsers();
      var key = login.toLowerCase();
      data.users[key] = {
        role: newRole,
        displayName: body.displayName || login,
        addedAt: new Date().toISOString(),
      };
      await github.saveUsers(data.users, data.sha);
      return res.status(200).json({ success: true });
    }

    // ── PUT — update role ──
    if (req.method === 'PUT') {
      var targetLogin = req.query.login;
      var body = req.body || {};
      if (!targetLogin || !body.role) {
        return res.status(400).json({ error: 'login (query) and role (body) required' });
      }
      if (['pending', 'viewer', 'editor', 'admin'].indexOf(body.role) === -1) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      var key = targetLogin.toLowerCase();
      if (key === session.login.toLowerCase()) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }

      var data = await github.getUsers();
      if (!data.users[key]) {
        return res.status(404).json({ error: 'User not found' });
      }
      data.users[key].role = body.role;
      await github.saveUsers(data.users, data.sha);
      return res.status(200).json({ success: true });
    }

    // ── DELETE — remove user ──
    if (req.method === 'DELETE') {
      var targetLogin = req.query.login;
      if (!targetLogin) {
        return res.status(400).json({ error: 'login query parameter required' });
      }

      var key = targetLogin.toLowerCase();
      if (key === session.login.toLowerCase()) {
        return res.status(400).json({ error: 'Cannot remove yourself' });
      }

      var data = await github.getUsers();
      if (!data.users[key]) {
        return res.status(404).json({ error: 'User not found' });
      }
      delete data.users[key];
      await github.saveUsers(data.users, data.sha);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('admin/users error:', e);
    return res.status(500).json({ error: 'Internal error: ' + e.message });
  }
};
