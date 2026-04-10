const { EmbedBuilder, ComponentType, MessageFlags } = require('discord.js');
const getProgressBar = require('./getProgressBar');
const { name, colours } = require('../config.json');

class progressTracker {
    constructor(interaction, getTimeField) {
        this.interaction = interaction;
        this.user = interaction.user;
        this.targetMessage;
        this.embed;
        this.totalSeconds = 0;
        this.taskTimer = process.hrtime();
        this.row;
        this.sectionsProgress;
        this.currentPage = 1;
        this.cancelled = false;
        this.getTimeField = getTimeField.bind(this); // <-- IMPORTANT
    }

    async end() {
        for (const component of this.row.components) {
            component.setDisabled(true);
        }
        await this.targetMessage.edit({
            components: [this.row]
        });
    }

    getTimeEmbed() {
        return {
            name: '\u200B',
            value: this.getTimeField()
        };
    }

    async wait(time, message, cancelFlag = async () => false) {
        // Resolve wait time in seconds
        const waitSeconds =
            typeof time === "number"
                ? time
                : Math.floor(Math.random() * (time.max - time.min + 1)) + time.min;

        if (waitSeconds <= 0) return;

        const waitMs = waitSeconds * 1000;
        const endTimestamp = Math.floor(Date.now() / 1000 + waitSeconds);

        await this.updateEmbed(`${message}\` <t:${endTimestamp}:R>`);

        const interval = 3000;
        const start = Date.now();

        while (true) {
            if (await cancelFlag()) break;

            const elapsed = Date.now() - start;
            const remaining = waitMs - elapsed;

            if (remaining <= 0) break;

            await new Promise(res => setTimeout(res, Math.min(interval, remaining)));
        }
    }

    async updateTime() {
        this.embed.data.fields[this.embed.data.fields.length - 1] = (this.getTimeEmbed());
    }

    async updateEmbed(description) {
        this.embed.data.description = `\`${description}\`${this.sectionsProgress.length > 1 ? `\n*Page ${this.currentPage} of ${this.sectionsProgress.length}*` : ''}`;

        await this.updateTime();

        await this.targetMessage.edit({
            embeds: [this.embed]
        });
    }

    async updateProgressBar(index, newProg, progMax=1) {
        this.embed.data.fields = [];
        const progressBar = getProgressBar(newProg, progMax);
        const adjustedIndex = Math.floor(index / 5);
        this.currentPage = adjustedIndex + 1;
        for (const section of this.sectionsProgress[adjustedIndex]) {
            this.embed.addFields(section);
        }
        this.embed.addFields(this.getTimeEmbed());

        this.embed.data.fields[index % 5].value = progressBar;

        await this.updateTime();

        await this.targetMessage.edit({
            embeds: [this.embed]
        });
    }

    async start(initialEmbed, row, sectionsProgress) {
        for (const section of sectionsProgress[0]) {
            initialEmbed.addFields(section);
        }
        initialEmbed.addFields(this.getTimeEmbed());

        try {
            this.embed = initialEmbed;
            this.row = row;
            this.sectionsProgress = sectionsProgress;
            this.targetMessage = await this.user.send({
                embeds: [initialEmbed],
                components: [row]
            });

            const collector = this.targetMessage.createMessageComponentCollector({
                componentType: ComponentType.Button
            });

            collector.on('collect', async (interaction) => {
                await interaction.deferUpdate();
                if (interaction.customId === 'cancel') {
                    this.cancelled = true;

                    await this.updateEmbed('Cancelling...');
                }
            });

        } catch {
            const noDMenabled = new EmbedBuilder()
                .setTitle('Cannot Direct Message')
                .setDescription('The autocompleter is unable to direct message you the progress tracker because your discord settings prevent this. You have been kicked out of the queue and the autocompleter has cancelled your task.')
                .addFields({
                    name: 'How do I fix this issue?',
                    value: `Please go to \`Settings -> Content & Social -> Social Permissions -> '${name}' -> Direct Messages ✅\``
                })
                .setColor(colours.light_red);

            await this.interaction.followUp({
                embeds: [noDMenabled],
                flags: MessageFlags.Ephemeral
            });
            return true;
        }
    }
}

module.exports = progressTracker;