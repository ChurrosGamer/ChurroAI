const { ButtonBuilder, ButtonStyle, MessageFlags, ActionRowBuilder, ContainerBuilder, StringSelectMenuBuilder, LabelBuilder, TextDisplayBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { emojis, colours } = require('../../../../config.json');
const { checkAccount } = require('../../../../database/accounts');
const UserSettingsEmbeds = new Map();

function getContainer(data, disabled=false) {
    const fakeTimeButton = new ButtonBuilder()
        .setCustomId('fake_time')
        .setLabel('Edit Time')
        .setEmoji(emojis.queue)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled);

    const modelsButton = new ButtonBuilder()
        .setCustomId('model_settings')
        .setLabel('Model Settings')
        .setEmoji(emojis.x)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled);

    const settingsRow = new ActionRowBuilder()
        .addComponents(fakeTimeButton, modelsButton);

    const mathsEmbed = new ContainerBuilder()
        .setAccentColor(colours.sparx_science)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## Sparx Science Settings\n**❓ What is Time?**\nTime is the amount of time the bot will wait for each question. This is **PER QUESTION**, not per homework.\n\n**🤔 What is the recommended Time?**\n The recommended time is 20-40s and cannot be set above 180s to prevent queue abuse!\n\n**🤖 What is the Model Order?**\nThe order of the models that will assist you with your homework.`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### Settings`),
            new TextDisplayBuilder().setContent(`⏰ **Minimum Fake Time**: ${data.min} Seconds`),
            new TextDisplayBuilder().setContent(`⏰ **Maximum Fake Time**: ${data.max} Seconds`),
            new TextDisplayBuilder().setContent(`🤖 \`${data.model ?? 'No Models'}\``)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    mathsEmbed.addActionRowComponents(settingsRow);
    return mathsEmbed;
}

async function updateSettingEmbed(interaction) {
    const account = await checkAccount(interaction.user.id);
    const data = account.sparx_science_settings;
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
					.setCustomId(`autocompleterModule_sparx(science)_faketime_settings`)
					.setTitle('Sparx Science Fake Time');

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
			} else if (componentInteraction.customId === 'model_settings') {
				const modal = new ModalBuilder()
					.setCustomId(`autocompleterModule_sparx(science)_model_settings`)
					.setTitle(`Model Settings`);
				const question = new StringSelectMenuBuilder()
					.setCustomId('model')
					.setPlaceholder("Model Order")
					.addOptions(
						{ label: "No Models", value: "No Models" },
						{ label: "2.5-flash", value: "2.5-flash" },
                        { label: "2.5-flash -> 2.5-pro", value: "2.5-flash -> 2.5-pro" },
					);

				const typeLabel = new LabelBuilder({
					label: 'Model Order',
					component: question
				});

				modal.addLabelComponents(typeLabel);
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