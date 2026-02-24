/**
 * GET /api/auth/login — Redirect to GitHub OAuth authorization page.
 */
var github = require('../_lib/github');

module.exports = function (req, res) {
  var cfg = github.getConfig();
  var redirectUri = cfg.siteUrl + '/api/auth/callback';
  var url = 'https://github.com/login/oauth/authorize' +
    '?client_id=' + cfg.clientId +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=read:user';
  res.writeHead(302, { Location: url });
  res.end();
};
