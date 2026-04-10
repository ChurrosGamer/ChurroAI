const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { colours } = require('../../config.json');
const getAllFiles = require('../../utils/getAllFiles');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('get_queue')
		.setDescription('Gets the current queue')
		.addStringOption(option =>
			option
				.setName('type')
				.setDescription('Select which queue to get')
				.setRequired(true)
				.addChoices(
					{ name: 'Reader', value: 'reader' },
					{ name: 'Maths', value: 'maths' },
					{ name: 'Science', value: 'science' },
				)
		),
	async execute(interaction) {
        const type = interaction.options.getString('type');
        const possibleQueues = getAllFiles('queue.js');
        const queuePeople = await possibleQueues[type].getPeople();

        let text = "";
        for (const person of queuePeople.currentPerson) {
            text += `\n**Current User.** ${person.interaction.user}`;
        }

        queuePeople.queue.forEach((value, index) => {
            text += `\n**${index}**. ${value.interaction.user}`;
        });

        const responseEmbed = new EmbedBuilder()
            .setTitle(`Queue Status - ${type}`)
            .setDescription(text || 'No one is in the queue and the bot is not in use')
            .setColor(colours.brown);

        await interaction.reply({ embeds: [responseEmbed]});
	},
};
