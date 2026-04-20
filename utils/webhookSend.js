require('dotenv').config();
const { MessageFlags } = require('discord.js');

async function webhookSend(container) {
    const payload = {
        flags: MessageFlags.IsComponentsV2,
        components: [container]
    };

    await fetch(process.env.STARTUP_WEBHOOK_URL + '?with_components=true', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
}

module.exports = webhookSend;