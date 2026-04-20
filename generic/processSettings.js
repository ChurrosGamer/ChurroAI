const getOptionalUserSession = require('../utils/getOptionalUserSession.js');
const seperateParentChild = require('../utils/seperateParentChild.js');
const { updateDB } = require('../database/general');
const { MessageFlags, EmbedBuilder } = require('discord.js');
const { colours } = require('../config.json');

async function processSettings(interaction) {
    await interaction.deferUpdate();
    const platform = seperateParentChild(interaction.customId.split('_')[1]);
    const platformSettingsString = platform.child ? `${platform.parent}_${platform.child}_settings` : `${platform.parent}_settings`;
    const action = interaction.customId.split('_')[2];

    let userSessions;
    let userSession;
    let updateSettingEmbed;
    if (platform.child) {
        userSessions = require(`../autocompleters/${platform.parent}/children/${platform.child}/userSessions`);
        ({ updateSettingEmbed } = require(`../autocompleters/${platform.parent}/children/${platform.child}/settings.js`));
    } else {
        userSessions = require(`../autocompleters/${platform.parent}/userSessions`);
        ({ updateSettingEmbed } = require(`../autocompleters/${platform.parent}/settings.js`));
    }
    userSession = await getOptionalUserSession(userSessions.get(interaction.user.id), interaction.user.id, platform.parent, platform.child);
    if (action === 'accuracy') {
        const accuracy = Number(interaction.fields.getTextInputValue('accuracy'));
        if (isNaN(accuracy) || accuracy < 0 || accuracy > 100) {
            return;
        }
        userSession.settings.accuracy = accuracy;
    } else if (action === 'faketime') {
        const minTime = Number(interaction.fields.getTextInputValue('min'));
        const maxTime = Number(interaction.fields.getTextInputValue('max'));
        if (isNaN(minTime) || minTime < 0 || maxTime < 0 || isNaN(maxTime) || minTime > maxTime) {
            return;
        }
        userSession.settings.min = minTime;
        userSession.settings.max = maxTime;
    } else if (action === 'wpmChange') {
        const wpmString = interaction.fields.getTextInputValue('wpm');
        const wpm = Number(wpmString);

        if (Number.isNaN(wpm) || (wpm < 200 && wpm !== 0)) {
            const exampleEmbed = new EmbedBuilder()
                .setColor(colours.light_red)
                .setTitle('Invalid WPM value')
                .setDescription('Words Per Minute must be a Number and be more than or equal to 200, or be set to 0 to make it read as fast as possible.');

            await interaction.followUp({ embeds: [exampleEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (wpm < userSession.settings.srp && wpm !== 0) {
            userSession.settings.srp = wpm;
        }

        userSession.settings.wpm = wpm;
    } else if (action === 'srpChange') {
        const pointsString = interaction.fields.getTextInputValue('srp');

        const points = Number(pointsString);

        if (Number.isNaN(points) || points <= 0 || points > 99999) {
            const exampleEmbed = new EmbedBuilder()
                .setColor(colours.light_red)
                .setTitle('Invalid SRP value')
                .setDescription('Sparx Reader Points must be a Number between 1-99999.');

            await interaction.followUp({ embeds: [exampleEmbed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (userSession.settings.wpm < points && userSession.settings.wpm !== 0) {
            userSession.settings.wpm = points;
        }

        userSession.settings.srp = points;
    } else if (action === 'model') {
        const modelOrder = interaction.fields.getField('model').values[0];
        userSession.settings.model = modelOrder;
    } else if (action === 'pdf') {
        const question = (interaction.fields.getField('question').values[0]) === 'true';
        const working_out = (interaction.fields.getField('working_out').values[0]) === 'true';
        userSession.settings.pdfSettings = { question, working_out };
    }
    await updateDB('accounts', { [platformSettingsString]: userSession.settings }, 'discord_id', interaction.user.id);
    await userSession.updateEmbed();
    await updateSettingEmbed(interaction);
}

module.exports = processSettings;