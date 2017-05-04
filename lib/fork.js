import { argv } from 'yargs';

const render = require(argv.filename);

process.send({
  message: 'waiting',
  body: process.pid
});

process.on('message', ({
  message,
  key,
  requestNumber
}) => {
  render(JSON.parse(message)).then(html => {
    process.send({
      message: 'renderComplete',
      key,
      body: {
        html,
        requestNumber
      }
    });
  }).catch(err => {
    process.send({
      message: 'error',
      key,
      body: err
    });
  });
});
