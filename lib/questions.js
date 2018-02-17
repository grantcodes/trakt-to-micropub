const nconf = require('nconf');
const inquirer = require('inquirer');
const Micropub = require('micropub-helper');
const log = new inquirer.ui.BottomBar().log.write;

nconf
  .argv()
  .env()
  .file({ file: __dirname + '/../config.json' });

module.exports = function(micropub) {
  return new Promise((resolve, reject) => {
    // Get all the user variables
    let questions = [];

    if (!nconf.get('trakt:clientId')) {
      questions.push({
        type: 'input',
        name: 'trakt:clientId',
        message: 'What is your trakt.tv app client id?',
      });
    }

    if (!nconf.get('trakt:clientSecret')) {
      questions.push({
        type: 'input',
        name: 'trakt:clientSecret',
        message: 'What is your trakt.tv app client secret?',
      });
    }

    if (!nconf.get('fanarttvApi')) {
      questions.push({
        type: 'input',
        name: 'fanarttvApi',
        message: 'What is your fanart.tv api key?',
      });
    }

    if (!nconf.get('tvdbApi')) {
      questions.push({
        type: 'input',
        name: 'tvdbApi',
        message: 'What is your thetvdb.com api key?',
      });
    }

    if (!nconf.get('tmdbApi')) {
      questions.push({
        type: 'input',
        name: 'tmdbApi',
        message: 'What is your themoviedb.org api key?',
      });
    }

    if (!nconf.get('micropub:me')) {
      questions.push({
        type: 'input',
        name: 'micropub:me',
        message: 'What is your indieweb url?',
      });
    }

    inquirer
      .prompt(questions)
      .then(results => {
        Object.keys(results).forEach(key => {
          nconf.set(key, results[key]);
        });
        nconf.save();
        if (
          nconf.get('micropub:token') &&
          nconf.get('micropub:micropubEndpoint') &&
          nconf.get('micropub:tokenEndpoint')
        ) {
          resolve();
        } else {
          micropub.options.me = nconf.get('micropub:me');
          return micropub.getAuthUrl();
        }
      })
      .then(url => {
        log(url);
        return inquirer.prompt([
          {
            type: 'input',
            name: 'micropubCode',
            message: 'Visit the url above to login and paste your code here',
          },
        ]);
      })
      .then(answers => micropub.getToken(answers.micropubCode))
      .then(token => {
        nconf.set('micropub:token', token);
        nconf.set(
          'micropub:micropubEndpoint',
          micropub.options.micropubEndpoint,
        );
        nconf.set('micropub:authEndpoint', micropub.options.authEndpoint);
        nconf.set('micropub:tokenEndpoint', micropub.options.tokenEndpoint);
        return micropub.query('syndicate-to');
      })
      .then(res => {
        if (res['syndicate-to']) {
          return inquirer.prompt([
            {
              type: 'checkbox',
              name: 'syndicateTo',
              message: 'Choose syndication options for watch posts',
              choices: res['syndicate-to'].map(syndication => syndication.uid),
            },
          ]);
        } else {
          nconf.set('micropub:syndicateTo', []);
          resolve();
        }
      })
      .then(answers => {
        nconf.set('micropub:syndicateTo', answers.syndicateTo);
        nconf.save();
        resolve();
      })
      .catch(err => reject(err));
  });
};
