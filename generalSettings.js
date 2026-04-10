const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder, MessageFlags, TextDisplayBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { emojis, colours } = require('./config.json');
const UserSettingsEmbeds = new Map();
const { checkAccount } = require('./database/accounts');
const { updateDB } = require('./database/general');

function getContainer(data, disabled=false) {

    const welcomeMessage = `## General Settings\n`;
    const pdfSettingsMessage = `\n\n**🔑 API Key**\nThe Gemini API Key used for the AI.\n`;

    const loginSuccessSection = new TextDisplayBuilder().setContent(`${welcomeMessage}${pdfSettingsMessage}`);
    const settingsSetup = new TextDisplayBuilder().setContent(`### Settings`);
    const text = (data.apikeys ?? []).join('\n');
    const pdfSet = new TextDisplayBuilder().setContent(
        `**🔑 API Keys**\`\`\`\n${text || 'None Configured. Using Global AI'}\n\`\`\``
    );

    const fakeTimeButton = new ButtonBuilder()
        .setCustomId('remove_apikey')
        .setLabel('Remove API Keys')
        .setEmoji(emojis.x)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled);

    const workingOutButton = new ButtonBuilder()
        .setCustomId('change_apikey')
        .setLabel('Add API Keys')
        .setEmoji(emojis.pdf)
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled);

    const settingsRow = new ActionRowBuilder()
        .addComponents(workingOutButton, fakeTimeButton);
    const mathsEmbed = new ContainerBuilder()
        .setAccentColor(colours.onyx)
        .addTextDisplayComponents(
            loginSuccessSection
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            settingsSetup,
            pdfSet
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    mathsEmbed.addActionRowComponents(settingsRow);

    return mathsEmbed;
}

async function updateSettingEmbed(interaction) {
    const account = await checkAccount(interaction.user.id);
    const container = getContainer(account);

    await interaction.editReply({
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [container],
        fetchReply: true
    });

}

async function handleSetting(interaction, account) {
    const data = account;
    const container = getContainer(data);

    const message_sent = await interaction.editReply({
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [container],
        fetchReply: true
    });

    UserSettingsEmbeds.set(interaction.user.id, interaction);

	const collector = message_sent.createMessageComponentCollector({
		time: 180_000
	});

    collector.on('collect', async (componentInteraction) => {
        if (componentInteraction.isButton()) {
            if (componentInteraction.customId === 'change_apikey') {
				const modal = new ModalBuilder()
					.setCustomId(`change_apikey`)
					.setTitle('Change Apikey');

				const minInput = new TextInputBuilder()
					.setCustomId('apikey')
					.setLabel('API Key')
					.setStyle(TextInputStyle.Short);

				const buttons = [];
				buttons.push(minInput);

				for (const button of buttons) {
					modal.addComponents(new ActionRowBuilder().addComponents(button));
				}
				await componentInteraction.showModal(modal);

			} else if (componentInteraction.customId === 'remove_apikey') {
                await updateDB('accounts', {apikeys: []}, 'discord_id', interaction.user.id);
                await componentInteraction.deferUpdate({ flags: MessageFlags.Ephemeral });
                const container = new ContainerBuilder()
                    .setAccentColor(colours.light_red)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`## API Key Removed\nYour Api Key has been successfully removed`)
                    );

                await componentInteraction.followUp({
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                    components: [container]
                });

                await interaction.editReply({
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                    components: [getContainer({apikeys: []})],
                    fetchReply: true
                });
            }
        }
    });

    collector.on('end', async () => {
        const container = getContainer(data, true);
        await interaction.editReply({
            components: [container]
        });
    });
}

module.exports = {
    handleSetting,
    updateSettingEmbed
};