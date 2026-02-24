/**
 * GET /api/auth/logout — Clear session cookie and redirect.
 */
var auth = require('../_lib/auth');
var github = require('../_lib/github');

module.exports = function (req, res) {
  auth.clearSessionCookie(res);
  var siteUrl = github.getConfig().siteUrl;
  res.writeHead(302, { Location: siteUrl + '/resources/' });
  res.end();
};
