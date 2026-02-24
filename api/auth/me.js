/**
 * GET /api/auth/me — Return the current user's profile and latest role.
 * Re-issues the session cookie if the role changed.
 */
var auth = require('../_lib/auth');
var github = require('../_lib/github');

module.exports = async function (req, res) {
  var session = auth.getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Fetch latest role from users.json
    var currentRole = await github.getUserRole(session.login);
    var role = currentRole || 'pending';

    // Re-issue token if role changed
    if (role !== session.role) {
      var newToken = auth.createToken({
        login: session.login,
        name: session.name,
        avatar: session.avatar,
        role: role,
      });
      auth.setSessionCookie(res, newToken);
    }

    return res.status(200).json({
      login: session.login,
      name: session.name,
      avatar: session.avatar,
      role: role,
    });
  } catch (e) {
    console.error('Auth/me error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
};
