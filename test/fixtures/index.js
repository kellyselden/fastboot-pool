'use strict';

const express = require('express');
const router = express.Router();

const init = require('fastboot-pool').default;

let initPromise = init({
  fastbootFilename: `${__dirname}/fastboot`,
  requestCountUntilFork: 5
});

router.get('/', (req, res) => {
  return initPromise.then(render => {
    return render({
      request: req,
      response: res
    }).then(html => {
      res.send(html);
    });
  });
});

module.exports = router;
