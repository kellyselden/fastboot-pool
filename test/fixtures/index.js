'use strict';

const express = require('express');
const router = express.Router();

const init = require('fastboot-pool').default;

let initPromise = init({
  fastbootFilename: `${__dirname}/fastboot`,
  requestCountUntilFork: 5
}).catch(() => {});

router.get('/', (req, res, next) => {
  return initPromise.then(render => {
    return render({
      // these test circular JSON
      request: req,
      response: res
    }).then((result) => {
      res.send(result.html);
    }).catch(next);
  });
});

module.exports = router;
