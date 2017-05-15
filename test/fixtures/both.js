'use strict';

const url = require('url');
const FastBoot = require('fastboot');

const app = new FastBoot({
  distPath: '../my-app/dist'
});

let count = 0;

module.exports = function(req, res) {
  if (++count % 2 === 0) {
    return res.status(500).send('Congratulations, you failed!');
  }

  app.visit(url.parse(req.url).path, {
    request: req,
    response: res
  }).then(result => {
    return result.html();
  }).then(html => {
    res.send(html);
  });
};
