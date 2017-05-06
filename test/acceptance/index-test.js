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

const debug = _debug('fastboot-pool');

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

    debug('my-app: ember new my-app -sg -sn');
    execSync('ember new my-app -sg -sn', {
      cwd: 'tmp'
    });

    moveSync('tmp/node_modules', 'tmp/my-app/node_modules');
    if (existsSync('tmp//yarn.lock')) {
      moveSync('tmp/yarn.lock', 'tmp/my-app/yarn.lock');
    }

    let packageJson = readJsonSync('tmp/my-app/package.json');

    packageJson.devDependencies['ember-cli-fastboot'] = '^1.0.0-beta.18';

    writeJsonSync('tmp/my-app/package.json', packageJson);

    debug('my-app: yarn');
    execSync('yarn', {
      cwd: 'tmp/my-app'
    });

    // execSync('ember g ember-cli-fastboot', {
    //   cwd: 'tmp/my-app'
    // });
  } else {
    debug('my-app: ember new my-app -sg --yarn');
    execSync('ember new my-app -sg --yarn', {
      cwd: 'tmp'
    });

    debug('my-app: ember i ember-cli-fastboot');
    execSync('ember i ember-cli-fastboot', {
      cwd: 'tmp/my-app'
    });
  }

  debug('my-app: ember b');
  execSync('ember b', {
    cwd: 'tmp/my-app'
  });
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

    debug('express: express express');
    execSync('express express', {
      cwd: 'tmp'
    });

    moveSync('tmp/node_modules', 'tmp/express/node_modules');
    if (existsSync('tmp//yarn.lock')) {
      moveSync('tmp/yarn.lock', 'tmp/express/yarn.lock');
    }

    let packageJson = readJsonSync('tmp/express/package.json');

    packageJson.dependencies['fastboot-pool'] = '';
    packageJson.dependencies['fastboot'] = '^1.0.0-rc.6';

    writeJsonSync('tmp/express/package.json', packageJson);

    ensureSymlinkSync(process.cwd(), 'tmp/express/node_modules/fastboot-pool');

    debug('express: yarn');
    execSync('yarn', {
      cwd: 'tmp/express'
    });
  } else {
    debug('express: express express');
    execSync('express express', {
      cwd: 'tmp'
    });

    let packageJson = readJsonSync('tmp/express/package.json');

    packageJson.dependencies['fastboot-pool'] = '';

    writeJsonSync('tmp/express/package.json', packageJson);

    ensureSymlinkSync(process.cwd(), 'tmp/express/node_modules/fastboot-pool');

    debug('express: yarn add fastboot');
    execSync('yarn add fastboot', {
      cwd: 'tmp/express'
    });
  }

  ['index.js', 'fastboot.js'].forEach(file => {
    copySync(
      `test/fixtures/${file}`,
      `tmp/express/routes/${file}`,
      { overwrite: true }
    );
  });
}

describe('Acceptance', function() {
  let cwd;
  let server;

  before(function() {
    this.timeout(10 * 60 * 1000);

    init(true, false);

    cwd = process.cwd();
    process.chdir('tmp/express');
  });

  beforeEach(function() {
    server = spawn('node', ['bin/www'], {
      env: Object.assign({
        DEBUG: 'fastboot-pool'
      }, process.env)
    });

    server.stderr.pipe(process.stderr);
  });

  afterEach(function(done) {
    server.on('exit', () => {
      server = null;
      done();
    });
    server.kill('SIGINT');
  });

  after(function() {
    process.chdir(cwd);
  });

  it('test', function(done) {
    this.timeout(60 * 1000);

    let wasSent;
    let expected = 20;
    let forks = {};
    server.stderr.on('data', data => {
      data = data.toString();

      let parts = data.split(' ');
      parts.forEach((part, i) => {
        if (part.indexOf('iswaiting') === 0) {
          let fork = parts[i - 1];
          forks[fork] = 0;

          if (!wasSent) {
            for (let i = 0; i < expected; i++) {
              request('http://localhost:3000');
            }
            wasSent = true;
          }
        }
        if (part === 'wasrendered') {
          let fork = parts[i - 1];
          forks[fork]++;
        }
      });

      if (data.indexOf('currentcount 0') !== -1) {
        let count = Object.keys(forks).reduce((count, fork) => {
          return count + forks[fork];
        }, 0);

        expect(count).to.equal(expected);

        done();
      }
    });
  });
});
