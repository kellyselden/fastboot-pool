'use strict';

const FastBoot = require('fastboot');

const app = new FastBoot({
  distPath: '../my-app/dist'
});

module.exports = function(message) {
  let request = message.request;
  let response = message.response;

  if (!request.protocol) {
    throw new Error('prototype members missing');
  }

  return app.visit(request.url, {
    request,
    response
  }).then(result => {
    return result.html();
  }).then(html => {
    let circular = {};
    circular.circular = circular;
    return {
      circular,
      html
    };
  });
};
