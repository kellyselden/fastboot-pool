'use strict';

const url = require('url');
const FastBoot = require('fastboot');

const app = new FastBoot({
  distPath: '../my-app/dist'
});

module.exports = function(req, res, next) {
  if (req.get('host') !== 'localhost:3000') {
    throw new Error(`host ${req.get('host')} is wrong`);
  }
  if (!req.query.works) {
    throw new Error(`query ${JSON.stringify(req.query)} isn\'t working`);
  }
  if (!req.body.works) {
    throw new Error(`body ${JSON.stringify(req.body)} isn\'t working`);
  }

  app.visit(url.parse(req.url).path, {
    request: req,
    response: res
  }).then(result => {
    return result.html();
  }).then(html => {
    res.send(html);
  }).catch(next);
};
