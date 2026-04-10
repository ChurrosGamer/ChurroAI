const { SeparatorSpacingSize, StringSelectMenuOptionBuilder, SectionBuilder, SeparatorBuilder, ThumbnailBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { emojis, colours } = require('../../../../config.json');
const base = require('../../../../generic/baseUserSessions');

const saveAccountBtn = new ButtonBuilder()
    .setCustomId('save_account')
    .setLabel('Save Account')
    .setEmoji(emojis.save_account)
    .setStyle(ButtonStyle.Secondary);
const tagChangerBtn = new ButtonBuilder()
    .setCustomId('tag_changer')
    .setLabel('Tag Changer')
    .setEmoji(emojis.tag_changer)
    .setStyle(ButtonStyle.Secondary);

class userSession {
    constructor(interaction, loginDetails, requesticator) {
        this.interaction = interaction;
        this.loginDetails = loginDetails;
        this.requesticator = requesticator;
        this.platform = 'reader';
        // Reader Specific Settings
        this.settings = {};
        this.srp = 0;
        this.wpm = 0;
        this.mode = 'Read Until Points Target Achieved';
        this.goldReader = false;
        // Reader Specific UI State
        this.selectedHomework = null;
    }

    loadFromObject(data) {
        Object.assign(this, data);
    }

    async createSelector() {
        const select = new StringSelectMenuBuilder()
            .setCustomId('select_homework')
            .setPlaceholder('Choose a book')
            .setMinValues(0);

        let booksAdded = 0;
        let currentSelectedBookId;

        const bookNames = {};
        let homeworkBooks = [];
        const createBookSelector = async () => {
            homeworkBooks = await this.requesticator.getHomeworks();
            homeworkBooks.sort((a, b) => {
                // First: sort so that setBook === true comes first
                if (a.setBook !== b.setBook) {
                    return a.setBook ? -1 : 1; // true before false
                }

                // Then: sort by progress descending
                return b.progress - a.progress;
            });

            booksAdded = 0;
            currentSelectedBookId = null;
            // UserSession.selectedBook = currentSelectedBookId;
            // UserSession.loadFromObject({ selectedBook: currentSelectedBookId });
            for (const book of homeworkBooks) {
                booksAdded += 1;
                bookNames[book.bookId] = book.title;
                const option = new StringSelectMenuOptionBuilder()
                    .setLabel(book.title)
                    .setDescription(`${book.progress}%`)
                    .setValue(book.bookId)
                    .setDefault(this.selectedHomework === book.bookId);
                if (book.bookId === currentSelectedBookId) {
                    option.setDefault(true);
                }
                select.addOptions(option);
            }
        };

        this.bookNames = bookNames;

        await createBookSelector();

        if (booksAdded === 0) {
            const bookUid = await this.requesticator.getNewBook();
            // console.log('Newe Book uid', bookUid);
            if (bookUid) await this.requesticator.getBookTask(bookUid);
            await createBookSelector();
        }

        this.selectRow = select;
    }

    async init() {
        this.userInfo = await this.requesticator.getUserInfo();
        this.userDisplayName = await this.requesticator.getUserDisplayName();
    }

    async updateEmbed(disabled = false) {

        const goldEmoji = this.goldReader ? emojis.goldtrue : emojis.goldfalse;

        const sectionThumb = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## Library\nWelcome, ${goldEmoji} **${this.userInfo.givenName} the ${this.userDisplayName}**!`)
            )
            .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: 'https://i.postimg.cc/cJQg4QDt/library-book.webp' } }));

        const startRow = new ActionRowBuilder();
        if (this.selectedHomework) {
            const startButton = new ButtonBuilder()
                .setCustomId('start')
                .setLabel('Start')
                .setEmoji(emojis.tick)
                .setStyle(ButtonStyle.Success)
                .setDisabled(disabled);
            startRow.addComponents(startButton);
        }

        const modeButton = new ButtonBuilder()
            .setCustomId('mode')
            .setLabel('Mode')
            .setEmoji(emojis.x)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled);
        startRow.addComponents(modeButton);

        if (this.loginDetails.username) {
            const saveAccountBtnCopy = ButtonBuilder.from(saveAccountBtn);
            saveAccountBtnCopy.setDisabled(disabled);
            startRow.addComponents(saveAccountBtnCopy);
        }

        const tagBtnCopy = ButtonBuilder.from(tagChangerBtn);
        tagBtnCopy.setDisabled(disabled);
        startRow.addComponents(tagBtnCopy);
        const settingBtn = new ButtonBuilder()
            .setCustomId('settings')
            .setLabel('Settings')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(emojis.settings)
            .setDisabled(disabled);
        startRow.addComponents(settingBtn);

        const settingsEmbed = new ContainerBuilder()
            .setAccentColor(colours.sparx_reader)
            .addSectionComponents(
                sectionThumb
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### Settings`)
            )
            .addTextDisplayComponents([new TextDisplayBuilder().setContent(`⏰ **Words Per Minute**: ${this.settings.wpm}`), new TextDisplayBuilder().setContent(`⭐️ **Sparx Reader Points**: ${this.settings.srp}`), new TextDisplayBuilder().setContent(`📖 **Mode**: *${this.mode}*`)]);

        await this.createSelector();
        if (this.selectRow.options.length) {
            this.selectRow.setDisabled(disabled);

            const selectButton = new ActionRowBuilder()
                .addComponents(
                    this.selectRow
                );

            settingsEmbed.addActionRowComponents(selectButton);
        }

        settingsEmbed.addActionRowComponents(startRow);

        // console.log(JSON.stringify(settingsEmbed, null, 2));

        const message_sent = await this.interaction.editReply({
            components: [settingsEmbed]
        });

        this.message_sent = message_sent;

        return message_sent;
    }
}

class userSessions extends base {
    constructor() {
        super('sparx', 'reader');
    }

    createNewSession(interaction, loginDetails, token) {
        this.sessions[interaction.user.id] = new userSession(interaction, loginDetails, new this.requesticator(token, loginDetails));
        return this.sessions[interaction.user.id];
    }

}

const UserSessions = new userSessions();

module.exports = UserSessions;