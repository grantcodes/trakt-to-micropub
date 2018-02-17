const nconf = require('nconf');
const inquirer = require('inquirer');
const ui = new inquirer.ui.BottomBar();

nconf
  .argv()
  .env()
  .file({ file: __dirname + '/../config.json' });

module.exports = function(trakt) {
  return new Promise((resolve, reject) => {
    const traktAccessToken = nconf.get('trakt:accessToken');
    const traktRefreshToken = nconf.get('trakt:refreshToken');
    const traktExpires = nconf.get('trakt:expires');

    if (traktAccessToken && traktRefreshToken && traktExpires) {
      trakt
        .import_token({
          access_token: traktAccessToken,
          refresh_token: traktRefreshToken,
          expires: traktExpires,
        })
        .then(newTokens => {
          if (newTokens.access_token) {
            nconf.set('trakt:accessToken', newTokens.access_token);
            nconf.set('trakt:expires', newTokens.expires);
            nconf.set('trakt:refreshToken', newTokens.refresh_token);
            nconf.save();
          }
          resolve();
        })
        .catch(error => reject(error));
    } else {
      trakt
        .get_codes()
        .then(poll => {
          ui.log.write('Visit this url:');
          ui.log.write(poll.verification_url);
          ui.log.write('And enter this code:');
          ui.log.write(poll.user_code);
          return trakt.poll_access(poll);
        })
        .then(res => {
          nconf.set('trakt:accessToken', res.access_token);
          nconf.set('trakt:expires', res.expires_in);
          nconf.set('trakt:refreshToken', res.refresh_token);
          nconf.save();
          resolve();
        })
        .catch(error => reject(error));
    }
  });
};
