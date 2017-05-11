'use strict';

const express = require('express');
const router = express.Router();

const init = require('fastboot-pool').default;

let initPromise = init({
  fastbootFilename: `${__dirname}/fastboot`,
  requestCountUntilFork: 5
});

router.get('/', (req, res, next) => {
  return initPromise.then(render => {
    return render({
      request: req,
      response: res
    }).then(html => {
      res.send(html);
    }).catch(next);
  });
});

module.exports = router;
