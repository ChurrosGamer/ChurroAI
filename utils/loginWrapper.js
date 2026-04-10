const puppetQueue = require('../queues/puppeteerQueue');

function loginWrapper(loginFn) {
  return puppetQueue.add(() => loginFn());
}

module.exports = loginWrapper;