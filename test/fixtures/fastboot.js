'use strict';

const FastBoot = require('fastboot');

const app = new FastBoot({
  distPath: '../my-app/dist'
});

module.exports = function({
  request,
  response
}) {
  return app.visit(request.url, {
    request,
    response
  }).then(result => {
    return result.html();
  });
};
