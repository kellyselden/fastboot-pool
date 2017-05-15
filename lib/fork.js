import { argv } from 'yargs';
import stringify from 'json-stringify-safe';

const {
  filename
} = argv;

let render = require(filename);

process.send({
  message: 'waiting',
  body: process.pid
});

process.on('message', ({
  message,
  key,
  requestNumber
}) => {
  render(JSON.parse(message)).then(result => {
    process.send({
      message: 'renderComplete',
      key,
      body: {
        result: stringify(result),
        requestNumber
      }
    });
  }).catch(err => {
    process.send({
      message: 'error',
      key,
      body: {
        error: JSON.stringify(err, Object.getOwnPropertyNames(err)),
        requestNumber
      }
    });
  });
});
