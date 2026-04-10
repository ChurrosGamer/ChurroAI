const { ButtonBuilder, ButtonStyle, ActionRowBuilder, ContainerBuilder, MessageFlags, TextDisplayBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { checkAccount } = require('../../database/accounts');
const { emojis, colours } = require('../../config.json');
const UserSettingsEmbeds = new Map();

function getContainer(data, disabled=false) {
    const fakeTimeButton = new ButtonBuilder()
        .setCustomId('fake_time')
        .setLabel('Edit Time')
        .setEmoji(emojis.queue)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled);

    const settingsRow = new ActionRowBuilder()
        .addComponents(fakeTimeButton);

    const mathsEmbed = new ContainerBuilder()
        .setAccentColor(colours.seneca)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## Seneca Settings`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### Settings`),
            new TextDisplayBuilder().setContent(`⏰ **Minimum Fake Time**: ${data.min} Seconds`),
            new TextDisplayBuilder().setContent(`⏰ **Maximum Fake Time**: ${data.max} Seconds`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    mathsEmbed.addActionRowComponents(settingsRow);
    return mathsEmbed;
}

async function updateSettingEmbed(interaction) {
    const account = await checkAccount(interaction.user.id);
    const data = account.seneca_settings;
    const container = getContainer(data);

    await interaction.editReply({
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [container],
        fetchReply: true
    });
}

async function handleSetting(interaction, data) {
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
            if (componentInteraction.customId === 'fake_time') {
				const modal = new ModalBuilder()
					.setCustomId(`autocompleterModule_seneca_faketime_settings`)
					.setTitle('Fake Time');

				const minInput = new TextInputBuilder()
					.setCustomId('min')
					.setLabel('Min Time (Seconds)')
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('0-180');

				const maxInput = new TextInputBuilder()
					.setCustomId('max')
					.setLabel('Max Time (Seconds)')
					.setStyle(TextInputStyle.Short)
					.setPlaceholder('0-180');

				const buttons = [];
				buttons.push(minInput, maxInput);

				for (const button of buttons) {
					modal.addComponents(new ActionRowBuilder().addComponents(button));
				}
				await componentInteraction.showModal(modal);
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