import stringify from 'json-stringify-safe';
import v4 from 'uuid';
import { fork } from 'node-debug-helper';
import _debug from 'debug';

const debug = _debug('fastboot-pool');

let count = 0;

export default function init({
  fastbootFilename,
  requestCountUntilFork
}) {
  let fb1Promise = init();

  // wait for the first one to finish in case it fails to init fastboot
  // to prevent doubled error message
  // noop catch to suppress UnhandledPromiseRejectionWarning
  let fb2Promise = fb1Promise.then(init).catch(() => {});

  let resetCount = 0;

  let responseLookup = {};

  let waitingResponse = [];

  function swap() {
    let wait = waitAndKill(waitingResponse);

    let promise = fb1Promise.then(fb1 => {
      return init().then(fb2 => {
        return wait(fb1).then(() => {
          return fb2;
        });
      });
    });

    fb1Promise = fb2Promise;

    fb2Promise = promise;

    waitingResponse = [];
  }

  function waitAndKill(waitingResponse) {
    return fb => {
      // swallow errors
      // errors are already thrown to express caller
      // we just want to avoid Promise.all early return behavior here
      waitingResponse = waitingResponse.map(p => p.catch(e => e));

      return Promise.all(waitingResponse).then(() => {
        debug(fb.pid + ' waskilled');
        fb.kill('SIGINT');
      });
    };
  }

  function init() {
    return new Promise((resolve2, reject2) => {
      let fb = fork(`${__dirname}/fork.js`, [
        '--filename',
        fastbootFilename
      ]);

      fb.on('exit', (code, signal) => {
        if (code === 1) {
          reject2(new Error(`Failed to run your fastboot file. Code ${code} signal ${signal}`));
        }
      });

      fb.on('message', ({
        message,
        key,
        body
      }) => {
        let resolve;
        let reject;
        if (responseLookup[key]) {
          resolve = responseLookup[key].resolve;
          reject = responseLookup[key].reject;
        }
        switch (message) {
          case 'waiting':
            debug(body + ' iswaiting');

            resolve2(fb);
            break;
          case 'renderComplete':
            delete responseLookup[key];

            resolve(JSON.parse(body.result));

            debug(fb.pid + ' wasrendered ' + body.requestNumber + ' currentcount ' + --count);

            break;
          case 'error':
            delete responseLookup[key];

            reject(JSON.parse(body.error));

            debug(fb.pid + ' didfail ' + body.requestNumber + ' currentcount ' + --count);

            break;
        }
      });
    });
  }

  function render(message) {
    count++;
    let promise;
    if (resetCount++ === requestCountUntilFork) {
      promise = fb2Promise;
      swap();
      resetCount = 1;
    } else {
      promise = fb1Promise;
    }
    let requestNumber = resetCount;
    promise = promise.then(function(fb) {
      let key = v4();
      return new Promise((resolve, reject) => {
        responseLookup[key] = {
          resolve,
          reject
        };

        fb.send({
          message: stringify(message),
          key,
          requestNumber
        });
      });
    });

    waitingResponse.push(promise);

    return promise;
  }

  return fb1Promise.then(() => {
    return render;
  });
}
