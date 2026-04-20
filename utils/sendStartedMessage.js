const { 
    ContainerBuilder, 
    TextDisplayBuilder, 
} = require('discord.js');
const webhookSend = require('./webhookSend');

async function sendStartedMessage(client) {
    const container = new ContainerBuilder()
        .setAccentColor(0xFFA53F)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`\n# Started the bot at <t:${Math.floor(Date.now() / 1000)}:T>\n@everyone Logged in as **${client.user.tag}**!`)
        );

    await webhookSend(container);
}

module.exports = sendStartedMessage;