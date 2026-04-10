const QueueSystem = require('../../../../queues/queue');
const { queue_size } = require('../../../../config.json'); 

const queue = new QueueSystem(queue_size.sparx_science);

module.exports = queue;