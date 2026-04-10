const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { colours } = require('../../config.json');
const getAllFiles = require('../../utils/getAllFiles');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('force_queue')
		.setDescription('Force the queue')
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

        if (!queuePeople.currentPerson) {
            const responseEmbed = new EmbedBuilder()
                .setTitle(`No current person using the bot`)
                .setDescription('Noone is is currently using the bot')
                .setColor(colours.brown);

            await interaction.reply({ embeds: [responseEmbed]});
            return;
        }

        possibleQueues[type].lockPerson = [];

        const responseEmbed = new EmbedBuilder()
            .setTitle(`Queue Forced`)
            .setDescription(`People currently using the autocompleter specified have been forced out.`)
            .setColor(colours.brown);

        await interaction.reply({ embeds: [responseEmbed]});
	},
};
