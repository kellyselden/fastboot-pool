import stringify from 'json-stringify-safe';
import v4 from 'uuid';
import debug from 'node-debug-helper';

// let count = 0;

export default function init({
  filename,
  requestCountUntilFork
}) {
  let fb1Promise = init();
  let fb2Promise = init();

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
      return Promise.all(waitingResponse).then(() => {
        // console.log(fb.pid + ' waskilled');
        fb.kill('SIGINT');
      });
    };
  }

  function init() {
    return new Promise(resolve2 => {
      let fb = debug.fork(`${__dirname}/fork.js`, ['--filename=' + filename]);

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
            // console.log(body + ' iswaiting');

            resolve2(fb);
            break;
          case 'renderComplete':
            delete responseLookup[key];

            resolve(body.html);

            // console.log(fb.pid + ' wasrendered ' + body.requestNumber + ' currentcount ' + --count);

            break;
          case 'error':
            delete responseLookup[key];

            reject(body);

            break;
        }
      });
    });
  }

  return function render(message) {
    // count++;
    let promise;
    if (++resetCount === requestCountUntilFork) {
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
  };
}
