import { expect } from 'chai';
import { exec, execSync } from 'child_process';
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

describe('test', function() {
  it('test', function(done) {
    this.timeout(15 * 60 * 1000);

    init(false, false);

    let cwd = process.cwd();
    process.chdir('tmp/express');

    debug('express: npm start');
    let p = exec('npm start', {
      env: Object.assign({
        DEBUG: 'fastboot-pool'
      }, process.env)
    });

    let wasSent;
    p.stderr.on('data', function(data) {
      debug('stderr: ', data.toString());
      if (!wasSent && data.toString().indexOf('iswaiting') !== -1) {
        for (let i = 0; i < 20; i++) {
          request('http://localhost:3000');
        }
        wasSent = true;
      }
      if (data.toString().indexOf('currentcount 0') !== -1) {
        p.kill();

        process.chdir(cwd);

        expect(true).to.be.true;

        done();
      }
    });
    p.stdout.on('data', function(data) {
      debug('stdout: ', data.toString());
    });

    p.on('error', function(code, signal) {
      debug(`error code ${code} signal ${signal}`);
    });

    p.on('exit', function(code, signal) {
      debug(`exit code ${code} signal ${signal}`);
    });
  });
});