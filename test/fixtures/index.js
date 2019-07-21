'use strict';

const express = require('express');
const router = express.Router();

// eslint-disable-next-line node/no-missing-require
const init = require('fastboot-pool').default;

let initPromise = init({
  fastbootFilename: `${__dirname}/fastboot`,
  requestCountUntilFork: 5
}).catch(() => {});

router.get('/', (req, res) => {
  return initPromise.then(proxy => {
    return proxy(req, res, {
      works: true
    });
  });
});

module.exports = router;
