import { expect } from 'chai';
import { spawn, execSync } from 'child_process';
import {
  ensureDirSync,
  copySync,
  ensureSymlinkSync,
  readJsonSync,
  writeJsonSync,
  moveSync,
  removeSync,
  existsSync,
  emptyDirSync
} from 'fs-extra';
import request from 'request';
import _debug from 'debug';

const isDebugEnabled = _debug.enabled('fastboot-pool');
const debug = _debug('fastboot-pool');

let {
  npm_package_devDependencies_ember_cli_fastboot: emberCliFastbootVersion,
  npm_package_devDependencies_fastboot: fastbootVersion
} = process.env;

// temporary until AppVeyor upgrades to yarn v0.27.5
if (!emberCliFastbootVersion) {
  emberCliFastbootVersion = process.env['npm_package_devDependencies_ember-cli-fastboot'];
}

const requestCountUntilFork = 5;

let cwd;
let server;

function getExpectedForkCount(requestCount) {
  return Math.max(Math.ceil(requestCount / requestCountUntilFork) + 1, 2);
}

function getExpectedForkKills(requestCount) {
  return Math.max(Math.ceil(requestCount / requestCountUntilFork) - 2, 0);
}

function run(command, options) {
  debug(`${options.cwd}: ${command}`);
  return execSync(command, options);
}

function init(earlyReturn, saveModules) {
  if (!earlyReturn && !saveModules) {
    debug('empty tmp');
    emptyDirSync('tmp');
  } else {
    debug('ensure tmp');
    ensureDirSync('tmp');
  }

  initMyApp(earlyReturn, saveModules);
  initExpress(earlyReturn, saveModules);
}

function initMyApp(earlyReturn, saveModules) {
  if (earlyReturn && existsSync('tmp/my-app')) {
    debug('my-app: early return');
    return;
  }

  if (saveModules) {
    ensureDirSync('tmp/my-app/node_modules');

    moveSync('tmp/my-app/node_modules', 'tmp/node_modules');
    if (existsSync('tmp/my-app/yarn.lock')) {
      moveSync('tmp/my-app/yarn.lock', 'tmp/yarn.lock');
    }

    removeSync('tmp/my-app');

    run('ember new my-app -sg -sn --yarn', {
      cwd: 'tmp'
    });

    moveSync('tmp/node_modules', 'tmp/my-app/node_modules');
    if (existsSync('tmp/yarn.lock')) {
      moveSync('tmp/yarn.lock', 'tmp/my-app/yarn.lock');
    }

    let packageJson = readJsonSync('tmp/my-app/package.json');

    packageJson.devDependencies['ember-cli-fastboot'] = emberCliFastbootVersion;

    writeJsonSync('tmp/my-app/package.json', packageJson);

    run('yarn', {
      cwd: 'tmp/my-app'
    });

    // run('ember g ember-cli-fastboot', {
    //   cwd: 'tmp/my-app'
    // });
  } else {
    run('ember new my-app -sg --yarn', {
      cwd: 'tmp'
    });

    run(`ember i ember-cli-fastboot@${emberCliFastbootVersion}`, {
      cwd: 'tmp/my-app'
    });
  }
}

function initExpress(earlyReturn, saveModules) {
  if (earlyReturn && existsSync('tmp/express')) {
    debug('express: early return');
    return;
  }

  if (saveModules) {
    ensureDirSync('tmp/express/node_modules');

    moveSync('tmp/express/node_modules', 'tmp/node_modules');
    if (existsSync('tmp/express/yarn.lock')) {
      moveSync('tmp/express/yarn.lock', 'tmp/yarn.lock');
    }

    removeSync('tmp/express');

    run('express express', {
      cwd: 'tmp'
    });

    moveSync('tmp/node_modules', 'tmp/express/node_modules');
    if (existsSync('tmp/yarn.lock')) {
      moveSync('tmp/yarn.lock', 'tmp/express/yarn.lock');
    }

    run('yarn', {
      cwd: 'tmp/express'
    });

    let packageJson = readJsonSync('tmp/express/package.json');

    packageJson.dependencies['fastboot'] = fastbootVersion;

    writeJsonSync('tmp/express/package.json', packageJson);
  } else {
    run('express express', {
      cwd: 'tmp'
    });

    run(`yarn add fastboot@${fastbootVersion}`, {
      cwd: 'tmp/express'
    });
  }

  let packageJson = readJsonSync('tmp/express/package.json');

  packageJson.dependencies['fastboot-pool'] = '';

  writeJsonSync('tmp/express/package.json', packageJson);

  ensureSymlinkSync(process.cwd(), 'tmp/express/node_modules/fastboot-pool');
}

function copyFixture(from, to) {
  return copySync(
    `test/fixtures/${from}`,
    `tmp/${to}`,
    { overwrite: true }
  );
}

function sendRequests(requestCount, expectedSuccesses, expectedFailures, sequential) {
  let wereRequestsSent;
  let forks = {};
  let responseSuccessCount = 0;
  let responseErrorCount = 0;

  let expectedForkCount = getExpectedForkCount(requestCount);
  let expectedForkKills = getExpectedForkKills(requestCount);

  return new Promise(resolve => {
    function endIfNeeded() {
      let forkKeys = Object.keys(forks);

      let forkCount = forkKeys.length;

      let forkKills = forkKeys.filter(fork => forks[fork].wasKilled).length;

      let totalSuccessCount = 0;
      let totalFailureCount = 0;
      for (let fork in forks) {
        let {
          successCount,
          failureCount
        } = forks[fork];

        expect(successCount, `fork ${fork} successes`).to.be.lte(requestCountUntilFork);
        expect(failureCount, `fork ${fork} failures`).to.be.lte(requestCountUntilFork);

        totalSuccessCount += successCount;
        totalFailureCount += failureCount;
      }

      let isFinished =
        forkCount === expectedForkCount &&
        forkKills === expectedForkKills &&
        totalSuccessCount + totalFailureCount === expectedSuccesses + expectedFailures &&
        responseSuccessCount + responseErrorCount === expectedSuccesses + expectedFailures;

      if (!isFinished) {
        return;
      }

      expect(totalSuccessCount, 'number of successful renders').to.equal(expectedSuccesses);
      expect(totalFailureCount, 'number of failed renders').to.equal(expectedFailures);
      expect(responseSuccessCount, 'number of successful responses').to.equal(expectedSuccesses);
      expect(responseErrorCount, 'number of error responses').to.equal(expectedFailures);

      resolve();
    }

    function _sendRequest(i) {
      if (i > requestCount) {
        return;
      }
      request('http://localhost:3000?works=true', (error, response, body) => {
        if (response.statusCode === 500) {
          expect(body, `request ${i}`).to.contain('Congratulations, you failed!');

          responseErrorCount++;
        } else {
          expect(body, `request ${i}`).to.contain('Congratulations, you made it!');

          responseSuccessCount++;
        }

        endIfNeeded();

        if (sequential) {
          _sendRequest(++i);
        }
      });
    }

    server.stderr.on('data', data => {
      let output = data.toString();

      let parts = output.split(' ');
      parts.forEach((part, i) => {
        if (part.indexOf('iswaiting') === 0) {
          let fork = parts[i - 1];
          forks[fork] = {
            successCount: 0,
            failureCount: 0,
            wasKilled: false
          };

          if (!wereRequestsSent) {
            if (sequential) {
              _sendRequest(1);
            } else {
              for (let i = 1; i <= requestCount; i++) {
                _sendRequest(i);
              }
            }

            wereRequestsSent = true;
          }

          endIfNeeded();
        }
        if (part === 'wasrendered') {
          let fork = parts[i - 1];
          forks[fork].successCount++;

          endIfNeeded();
        }
        if (part === 'didfail') {
          let fork = parts[i - 1];
          forks[fork].failureCount++;

          endIfNeeded();
        }
        if (part.indexOf('waskilled') === 0) {
          let fork = parts[i - 1];
          forks[fork].wasKilled = true;

          endIfNeeded();
        }
      });
    });
  });
}

function copyFixtures(getFastbootFixtureName, getClientFixtureName) {
  copyFixture('index.js', 'express/routes/index.js');

  let fastbootFile = getFastbootFixtureName ? getFastbootFixtureName() : 'success.js';
  copyFixture(fastbootFile, 'express/routes/fastboot.js');

  if (getClientFixtureName) {
    copyFixture(getClientFixtureName(), 'my-app/app/routes/application.js');
  } else {
    removeSync('tmp/my-app/app/routes/application.js');
  }
}

function prepServer() {
  cwd = process.cwd();
  process.chdir('tmp/express');
}

function startServer() {
  server = spawn('node', ['bin/www'], {
    env: Object.assign({
      DEBUG: 'fastboot-pool,flatten'
    }, process.env)
  });

  if (isDebugEnabled) {
    server.stderr.pipe(process.stderr);
  }
}

function stopServer(done) {
  server.on('exit', () => {
    server = null;
    done();
  });
  server.kill('SIGINT');
}

function cleanUp() {
  process.chdir(cwd);
}

describe('Acceptance', function() {
  this.timeout(60 * 1000);

  function bootstrap(callback) {
    return function() {
      let getFastbootFixtureName;
      let getClientFixtureName;

      callback.call(this, {
        getFastbootFixtureName(_getFastbootFixtureName) {
          getFastbootFixtureName = _getFastbootFixtureName;
        },
        getClientFixtureName(_getClientFixtureName) {
          getClientFixtureName = _getClientFixtureName;
        }
      });

      before(function() {
        this.timeout(10 * 60 * 1000);

        init(true, false);

        copyFixtures(getFastbootFixtureName, getClientFixtureName);

        run('ember b', {
          cwd: 'tmp/my-app'
        });

        prepServer();
      });

      beforeEach(startServer);

      afterEach(stopServer);

      after(cleanUp);
    };
  }

  describe('init fail', bootstrap(function({ getFastbootFixtureName }) {
    getFastbootFixtureName(function() {
      return 'init-fail.js';
    });

    it('handles a failed fastboot init', function(done) {
      server.stderr.on('data', data => {
        let output = data.toString();

        expect(output).to.not.contain('UnhandledPromiseRejectionWarning');
      });

      // I can't figure out another way to wait for UnhandledPromiseRejectionWarning.
      // Since it's the very last thing printed, there's nothing after it to test for.
      setTimeout(done, 1000);
    });
  }));

  describe('success', bootstrap(function() {
    it('forks twice for zero requests', function() {
      return sendRequests(0, 0, 0);
    });

    it('request count divisible by `requestCountUntilFork`', function() {
      return sendRequests(10, 10, 0);
    });

    it('request count not divisible by `requestCountUntilFork`', function() {
      return sendRequests(23, 23, 0);
    });

    it('handles sequential requests', function() {
      return sendRequests(12, 12, 0, true);
    });
  }));

  describe('fail', bootstrap(function({ getFastbootFixtureName }) {
    getFastbootFixtureName(function() {
      return 'fail.js';
    });

    it('handles the error case', function() {
      return sendRequests(17, 0, 17);
    });
  }));

  describe('both', bootstrap(function({ getFastbootFixtureName }) {
    getFastbootFixtureName(function() {
      return 'both.js';
    });

    it('handles both successes and failures', function() {
      return sendRequests(22, 13, 9);
    });
  }));

  describe('client error', bootstrap(function({ getClientFixtureName }) {
    getClientFixtureName(function() {
      return 'client-error.js';
    });

    it('handles ember errors', function() {
      return sendRequests(2, 0, 2);
    });
  }));
});
