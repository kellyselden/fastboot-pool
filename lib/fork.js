import { argv } from 'yargs';
import collapse from 'collapse-prototypes';

const {
  filename,
  shouldHandleSerialization
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
  render(message).then(result => {
    if (shouldHandleSerialization) {
      result = collapse(result, {
        stripFunctions: true,
        excludeNonenumerable: true,
        dropCycles: true,
        debugLabel: 'fork'
      });
    }

    process.send({
      message: 'renderComplete',
      key,
      body: {
        result,
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
