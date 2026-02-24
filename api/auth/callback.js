/**
 * GET /api/auth/callback — GitHub OAuth callback.
 * Exchanges authorization code for a token, looks up user role,
 * creates a session cookie, and redirects to /resources/.
 */
var auth = require('../_lib/auth');
var github = require('../_lib/github');

module.exports = async function (req, res) {
  var cfg = github.getConfig();

  try {
    var code = req.query && req.query.code;
    if (!code) {
      res.writeHead(302, { Location: cfg.siteUrl + '/resources/?error=no_code' });
      return res.end();
    }

    // Exchange code for GitHub access token
    var tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code: code,
      }),
    });
    var tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      res.writeHead(302, { Location: cfg.siteUrl + '/resources/?error=auth_failed' });
      return res.end();
    }

    // Get GitHub user profile
    var userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: 'Bearer ' + tokenData.access_token,
        'User-Agent': 'group-wiki',
      },
    });
    var ghUser = await userRes.json();

    // Determine role — read users.json once
    var data = await github.getUsers();
    var users = data.users;
    var sha = data.sha;
    var key = ghUser.login.toLowerCase();
    var adminLogin = cfg.adminLogin;
    var role;

    if (key === adminLogin && adminLogin) {
      // Admin override
      role = 'admin';
      if (!users[key] || users[key].role !== 'admin') {
        users[key] = {
          role: 'admin',
          displayName: ghUser.name || ghUser.login,
          avatar: ghUser.avatar_url || '',
          addedAt: new Date().toISOString(),
        };
        try { await github.saveUsers(users, sha); } catch (e) { /* race ok */ }
      }
    } else if (users[key]) {
      role = users[key].role;
      // Update display name / avatar if changed
      var changed = false;
      if (ghUser.name && users[key].displayName !== ghUser.name) {
        users[key].displayName = ghUser.name;
        changed = true;
      }
      if (ghUser.avatar_url && users[key].avatar !== ghUser.avatar_url) {
        users[key].avatar = ghUser.avatar_url;
        changed = true;
      }
      if (changed) {
        try { await github.saveUsers(users, sha); } catch (e) { /* ignore */ }
      }
    } else {
      // New user — add as pending
      role = 'pending';
      users[key] = {
        role: 'pending',
        displayName: ghUser.name || ghUser.login,
        avatar: ghUser.avatar_url || '',
        addedAt: new Date().toISOString(),
      };
      try { await github.saveUsers(users, sha); } catch (e) { /* ignore */ }
    }

    // Create session token
    var session = auth.createToken({
      login: ghUser.login,
      name: ghUser.name || ghUser.login,
      avatar: ghUser.avatar_url || '',
      role: role,
    });

    auth.setSessionCookie(res, session);
    res.writeHead(302, { Location: cfg.siteUrl + '/resources/' });
    res.end();
  } catch (e) {
    console.error('Callback error:', e);
    res.writeHead(302, { Location: cfg.siteUrl + '/resources/?error=server_error' });
    res.end();
  }
};
