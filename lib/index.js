import request from 'request';
import { fork } from 'node-debug-helper';
import _debug from 'debug';
import url from 'url';

const debug = _debug('fastboot-pool');

let count = 0;

function getUrl(req) {
  return url.format(Object.assign(url.parse(req.originalUrl), {
    protocol: req.protocol,
    host: req.get('host')
  }));
}

export default function init({
  fastbootFilename,
  requestCountUntilFork,
  forkPorts = [3001, 3002, 3003]
}) {
  let _fb0, _fb1, _fb2;
  let ports = forkPorts.reduce((ports, port) => {
    ports[port] = false;
    return ports;
  }, Object.create(null));

  function getNewPort() {
    for (let port in ports) {
      if (!ports[port]) {
        ports[port] = true;
        return port;
      }
    }
  }

  function releasePort(port) {
    ports[port] = false;
  }

  let fb0Promise = Promise.resolve({});

  let fb1Promise = init();

  // wait for the first one to finish in case it fails to init fastboot
  // to prevent doubled error message
  // noop catch to suppress UnhandledPromiseRejectionWarning
  let fb2Promise = fb1Promise.then(init).catch(() => {});

  let resetCount = 0;

  let waitingResponse = [];

  function swap() {
    debug('swappingstarted');

    let wait = waitAndKill(waitingResponse);

    let promise = fb0Promise.then(fb0 => {
      return wait(fb0).then(() => {
        // init has to wait for cleanup, otherwise it can request ports
        // out of control
        return init().then(fb2 => {
          return fb2;
        });
      });
    });

    fb0Promise = fb1Promise;

    fb1Promise = fb2Promise;

    fb2Promise = promise;

    waitingResponse = [];
  }

  function waitAndKill(waitingResponse) {
    return ({ fb, port }) => {
      if (!fb) {
        // this was the boot up null fork
        return Promise.resolve();
      }

      // swallow errors
      // errors are already thrown to express caller
      // we just want to avoid Promise.all early return behavior here
      waitingResponse = waitingResponse.map(p => p.catch(e => e));

      return Promise.all(waitingResponse).then(() => {
        return new Promise(resolve => {
          _fb0 = null;
          fb.kill('SIGINT');
          fb.on('exit', () => {
            releasePort(port);

            resolve();

            debug(fb.pid + ' waskilled releaseport ' + port);
          });
        });
      });
    };
  }

  function init() {
    return new Promise((resolve, reject) => {
      let port = getNewPort();

      let fb = fork(`${__dirname}/fork.js`, [
        '--filename',
        fastbootFilename,
        '--port',
        port
      ]);

      fb.once('exit', (code, signal) => {
        if (code === 1) {
          reject(new Error(`Failed to run your fastboot file. Code ${code} signal ${signal}`));
        }
      });

      debug(fb.pid + ' startedforking port ' + port);

      fb.once('message', () => {
        debug(fb.pid + ' iswaiting port ' + port);

        resolve({ fb, port });
      });

      _fb0 = _fb1;
      _fb1 = _fb2;
      _fb2 = fb;
    });
  }

  function render(req, res, body) {
    let promise;
    if (resetCount++ === requestCountUntilFork) {
      promise = fb2Promise;
      swap();
      resetCount = 1;
    } else {
      promise = fb1Promise;
    }
    let requestNumber = resetCount;
    promise = promise.then(({ fb, port }) => {
      debug(fb.pid + ' gotrequest ' + requestNumber + ' currentcount ' + ++count);

      return new Promise((resolve, reject) => {
        request({
          proxy: `http://localhost:${port}`,
          url: getUrl(req),
          headers: req.headers,
          body,
          json: true
        }, (err, res) => {
          if (err || res.statusCode === 500) {
            debug(fb.pid + ' didfail ' + requestNumber + ' currentcount ' + --count);

            return reject(err);
          }

          debug(fb.pid + ' wasrendered ' + requestNumber + ' currentcount ' + --count);

          resolve();
        }).pipe(res);
      });
    });

    waitingResponse.push(promise);

    return promise;
  }

  function killAll() {
    if (_fb0) {
      _fb0.kill('SIGINT');
      _fb0 = null;
      debug('_fb0 SIGINT');
    }
    if (_fb1) {
      _fb1.kill('SIGINT');
      _fb1 = null;
      debug('_fb1 SIGINT');
    }
    if (_fb2) {
      _fb2.kill('SIGINT');
      _fb2 = null;
      debug('_fb2 SIGINT');
    }
  }

  // sent by babel-watch
  // https://github.com/kmagiera/babel-watch/blob/v2.0.6/babel-watch.js#L211
  process.once('SIGHUP', function() {
    debug('SIGHUP');
    process.exit(0);
  });

  // this is needed for the tests
  // when a server is stopped, then quickly started again
  process.once('SIGINT', function() {
    debug('SIGINT');
    process.exit(0);
  });

  process.once('exit', function() {
    killAll();
    debug('exit');
  });

  return fb1Promise.then(() => {
    return render;
  });
}
