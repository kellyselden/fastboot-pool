import { argv } from 'yargs';
import express from 'express';
import http from 'http';
import bodyParser from 'body-parser';

const {
  filename,
  port
} = argv;

const app = express();

app.set('port', port);

app.use(bodyParser.json());

app.use(require(filename));

let server = http.createServer(app);

server.listen(port);

server.once('listening', () => {
  process.send(null);
});
