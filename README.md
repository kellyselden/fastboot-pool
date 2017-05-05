# fastboot-pool

[![Greenkeeper badge](https://badges.greenkeeper.io/kellyselden/fastboot-pool.svg)](https://greenkeeper.io/)
[![npm version](https://badge.fury.io/js/fastboot-pool.svg)](https://badge.fury.io/js/fastboot-pool)
[![Build Status](https://travis-ci.org/kellyselden/fastboot-pool.svg?branch=master)](https://travis-ci.org/kellyselden/fastboot-pool)
[![Build status](https://ci.appveyor.com/api/projects/status/nnjfs5tkwvgqch7i/branch/master?svg=true)](https://ci.appveyor.com/project/kellyselden/fastboot-pool/branch/master)

Manage Ember FastBoot memory usage using process pools

### Installation

```sh
yarn add fastboot-pool
```

### Usage

Given an express route that renders fastboot:

```js
// index.js
import express from 'express';
const router = express.Router();

import FastBoot from 'fastboot';

const app = new FastBoot({
  distPath: 'path/to/dist'
});

router.get('/', (req, res) => {
  return app.visit(req.url, {
    request: req,
    response: res
  }).then(result => {
    return result.html();
  }).then(html => {
    res.send(html);
  });
});
```

We might be noticing fastboot memory grows out of control. We might want to mitigate the memory growth with forked node process pools. Using this library, we can begin to rewrite our code:

```js
// index.js
import express from 'express';
const router = express.Router();

import init from 'fastboot-pool';

// `init` returns a promise that resolves once the first fastboot app initializes.
let initPromise = init({
  // the path to the file created below
  fastbootFilename: `${__dirname}/fastboot`,

  // choose an appropriate request count when you notice memory getting too high
  requestCountUntilFork: 5
});

router.get('/', (req, res) => {
  // The first request will wait if fastboot is not ready.
  // The rest will resolve immediately.
  return initPromise.then(render => {
    // `render` takes an options object that is serialized over IPC
    // and sent to your exported function.
    return render({
      request: req,
      response: res
    }).then(html => {
      // The result of your forked process promise is resolved here.
      res.send(html);
    });
  });
});
```

Then we move our fastboot-specific code to a new file that will run in a forked process.

```js
// fastboot.js

// This file is going to be dynamically `require`d in a fork,
// so you don't want to use a transpiler.

const FastBoot = require('fastboot');

const app = new FastBoot({
  distPath: 'path/to/dist'
});

// This is the same options object sent from the above `render` function.
module.exports = function({
  request,
  response
}) {
  // Return your normal fastboot promise.
  return app.visit(request.url, {
    request,
    response
  }).then(result => {
    return result.html();
  });
};
```

Now a new forked node process is created after a request count of your choosing, and the previous forks are cleaned up appropriately.

### Technical Breakdown

There are only ever three buckets at any time:

* `previous` bucket
  * no longer receiving requests
  * waits for all requests to complete
  * kills itself
* `current` bucket
  * fastboot is ready
  * receives `n` requests
* `next` bucket
  * initializes fastboot
  * waits for `previous` to die
  * waits for `current` to fill up

Once `current` fills up:
  * `previous` is released from memory
  * `current` becomes `previous`
  * `next` becomes `current`
  * a new `next` is created
