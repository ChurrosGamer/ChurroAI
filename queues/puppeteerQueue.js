const { default: PQueue } = require('p-queue');
const { browser_queue_size } = require('../config.json');
// OR just: const PQueue = require('p-queue'); (depending on how v6 exports)

const puppetQueue = new PQueue({
  concurrency: browser_queue_size,
});

module.exports = puppetQueue;