'use strict';

const FastBoot = require('fastboot');

const app = new FastBoot({
  distPath: '../my-app/dist'
});

let count = 0;

module.exports = function(message) {
  if (++count % 2 === 0) {
    return Promise.reject(new Error('Congratulations, you didn\'t make it!'));
  }

  let request = message.request;
  let response = message.response;

  return app.visit(request.url, {
    request,
    response
  }).then(result => {
    return result.html();
  }).then(html => ({ html }));
};
