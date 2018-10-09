const nconf = require('nconf');
const Micropub = require('micropub-helper');
const Trakt = require('trakt.tv');

const questions = require('./lib/questions');
const traktLogin = require('./lib/trakt-login');

let lastDate = nconf.get('lastDate') || 0;
let lastId = nconf.get('lastId');
let trakt = null;

let micropub = new Micropub({
  clientId: 'https://trakt.postrchild.com',
  redirectUri: 'https://postrchild.com/auth',
  state: Date.now(),
});

nconf
  .argv()
  .env()
  .file({ file: __dirname + '/config.json' });

questions(micropub)
  .then(() => {
    let traktOptions = {
      client_id: nconf.get('trakt:clientId'),
      client_secret: nconf.get('trakt:clientSecret'),
      pagination: true,
      plugins: {
        images: require('trakt.tv-images'),
      },
      options: {
        images: {
          fanartApiKey: nconf.get('fanarttvApi'),
          tvdbApiKey: nconf.get('tvdbApi'),
          tmdbApiKey: nconf.get('tmdbApi'),
        },
      },
    };
    trakt = new Trakt(traktOptions, true);
    return traktLogin(trakt);
  })
  .then(() => {
    micropub.options.token = nconf.get('micropub:token');
    micropub.options.micropubEndpoint = nconf.get('micropub:micropubEndpoint');
    micropub.options.authEndpoint = nconf.get('micropub:authEndpoint');
    micropub.options.tokenEndpoint = nconf.get('micropub:tokenEndpoint');
    getHistory(lastDate);
  })
  .catch(err => console.log(err));

function getHistory(after = false, page = 1) {
  let options = {};
  if (after) {
    options.start_at = new Date(after);
  }
  if (page) {
    options.page = page;
  }
  trakt.sync.history
    .get(options)
    .then(watched => {
      if (watched.data && watched.data.length) {
        watched.data.forEach(watch => postWatch(watch));
        if (watched.pagination && page < watched.pagination['page-count']) {
          this(after, page + 1)
            .then(res => console.log(res))
            .catch(err => console.log(err));
        }
      }
    })
    .catch(err => console.log(err));
}

function postWatch(watch) {
  return new Promise((resolve, reject) => {
    if (watch.id != lastId) {
      let post = {
        type: ['h-entry'],
        properties: {
          category: ['watch'],
          created: [new Date(watch.watched_at)],
          'mp-syndicate-to': nconf.get('micropub:syndicateTo'),
          visibility: ['unlisted'],
          trakt: [watch],
        },
      };

      let imageSearch = null;

      if (watch.type == 'episode') {
        post.properties.summary = [
          `📺 Watched ${watch.show.title} Episode ${
            watch.episode.number
          } Season ${watch.episode.season}: ${watch.episode.title}`,
        ];
        post.properties.category.push('watch--tv');
        post.properties['watch-of'] = [
          'https://trakt.tv/shows/' + watch.show.ids.slug,
        ];
        if (watch.episode) {
          if (watch.episode.season) {
            post.properties['watch-of'][0] +=
              '/seasons/' + watch.episode.season;
          }
          if (watch.episode.number) {
            post.properties['watch-of'][0] +=
              '/episodes/' + watch.episode.number;
          }
        }
        imageSearch = {
          tmdb: watch.show.ids.tmdb,
          imdb: watch.show.ids.imdb,
          tvdb: watch.show.ids.tvdb,
          type: 'show',
        };
      } else if (watch.type == 'movie') {
        post.properties.summary = [
          `🎬 Watched ${watch.movie.title} (${watch.movie.year})`,
        ];
        post.properties.category.push('watch--movie');
        post.properties['watch-of'] = [
          'https://trakt.tv/movies/' + watch.movie.ids.slug,
        ];
        imageSearch = {
          tmdb: watch.movie.ids.tmdb,
          imdb: watch.movie.ids.imdb,
          tvdb: watch.movie.ids.tvdb,
          type: 'movie',
        };
      }

      if (Date.parse(watch.watched_at) > lastDate) {
        lastDate = Date.parse(watch.watched_at);
        lastId = watch.id;
        nconf.set('lastDate', lastDate);
        nconf.set('lastId', watch.id);
        nconf.save();
      }

      trakt.images
        .get(imageSearch)
        .then(image => {
          if (image.poster) {
            post.properties.photo = [image.poster];
          }
          if (image.background) {
            post.properties.featured = [image.background];
          }
          post.properties.trakt[0].image = image;
          return micropub.create(post);
        })
        .then(res => resolve(res))
        .catch(err => reject(err));
    } else {
      resolve();
    }
  });
}
