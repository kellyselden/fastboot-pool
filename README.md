# fastboot-pool

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
  // required
  fastbootFilename: `${__dirname}/fastboot`,

  // choose an appropriate request count when you notice memory getting too high
  // required
  requestCountUntilFork: 5,

  // specify the three ports for the forks to cycle between
  // optional
  forkPorts: [3001, 3002, 3003]
});

router.get('/', (req, res) => {
  // The first request will wait if fastboot is not ready.
  // The rest will resolve immediately.
  return initPromise.then(proxy => {
    // `proxy` proxies your request to the express server running in your forked process.
    return proxy(req, res);
  });
});
```

Then we move our fastboot-specific code to a new file that will run in a forked process.

```js
// fastboot.js

// This file is going to be dynamically `require`d in a fork,
// so you don't want to use a transpiler.

const url = require('url');
const FastBoot = require('fastboot');

const app = new FastBoot({
  distPath: 'path/to/dist'
});

// This is the same options object sent from the above `render` function.
module.exports = function(req, res) {
  // Url parsing gets more complicated when proxying
  // because `req.url` now contains the hostname.
  app.visit(url.parse(req.url).path, {
    request: req,
    response: res
  }).then(result => {
    return result.html();
  }).then(html => {
    // Any response you send here will be proxied back to the host express response.
    res.send(html);
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
  * waits for `previous` to die
  * initializes fastboot
  * waits for `current` to fill up

Once `current` fills up:
  * `previous` is released from memory
  * `current` becomes `previous`
  * `next` becomes `current`
  * a new `next` is created

### Unsolved Problems

When you use the node debugger, the forks properly open free debug ports, but killing the debugger send no event for me to clean them up. You have to manually kill them. This is all I could find on the topic http://stackoverflow.com/questions/43957428/does-the-node-js-debugger-send-sigint-sigterm-when-exiting-with-ctrl-c.
