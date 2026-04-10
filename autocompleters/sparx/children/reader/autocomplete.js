const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { logError } = require('../../../../utils/errorLogger.js');
const progressTracker = require('../../../../utils/progressTracker.js');
const formatTime = require('../../../../utils/formatTime');
const getProgressBar = require('../../../../utils/getProgressBar');
const getAIanswer = require('../../../../utils/getAIanswer.js');
const { checkAccount } = require('../../../../database/accounts.js');
const logger = require('../../../../utils/logger.js');
const { colours } = require('../../../../config.json');

async function autocomplete(userSession) {
    let bookUid = userSession.selectedHomework;
    let bookName = userSession.bookNames[bookUid];
    const settings = userSession.settings;

    const log = new logger(userSession.interaction.user.id, 'sparx_reader');
    userSession.requesticator.log = log;
    log.logToFile('Logging Start');
    log.logToFile(`**Settings**\n ${[
        ["bookUid", bookUid],
        ["userSession.srp", settings.srp],
        ["userSession.wpm", settings.wpm],
        ["bookName", bookName],
        ["mode", userSession.mode]
    ].map(([name, value]) => `${name}: ${value}`).join("\n")}`);
    // await interaction.deferUpdate();
    userSession.requesticator.apikey = (await checkAccount(userSession.interaction.user.id)).apikey;
    const queue = require('./queue.js');
    let readUntilFinish = userSession.mode === 'Read Until Book Completed';
    // let readUntilGold = userSession.mode === 'Read Until Gold Reader Acquired';
    let pointsAcquired = 0;
    let timesO = 0;
    let finishedBook = false;
    let correctQuestions = 0;
    let totalQuestions = 0;
    let finishedAllBooks = false;

    const cancel = new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder()
        .addComponents(cancel);

    const initialEmbed = new EmbedBuilder()
        .setColor(colours.sparx_reader)
        .setTitle('Sparx Reader Autocompleter')
        .setDescription(`\`Starting Questions...\``);

    const sectionsProgress = [[{
        name: `Progress (${settings.srp} SRP)`,
        value: getProgressBar(0, 1)
    }]];

    const getTimeField = function () {
        return `> **Time Spent**: ${formatTime((process.hrtime(this.taskTimer))[0])}\n> **Sparx Reader Points Accumulated**: ${pointsAcquired}\n> **Accuracy**: ${isNaN(Math.round(correctQuestions / totalQuestions * 100)) ? 100 : Math.round(correctQuestions / totalQuestions * 100)}%\n> **Reading**: ${bookName}`;
    };
    const progressUpdater = new progressTracker(userSession.interaction, getTimeField);
    if (await progressUpdater.start(initialEmbed, row, sectionsProgress)) return;
    const shouldStop = async () => !((pointsAcquired < settings.srp || readUntilFinish) && timesO < 10 && !progressUpdater.cancelled && (await queue.stillUsing(userSession.interaction.user.id)));

    try {
        while (!(await shouldStop())) {
            log.logToFile(`Points Accumulated: ${pointsAcquired}\nQuestions Correct: ${correctQuestions}/${totalQuestions}`);
            const taskId = await userSession.requesticator.getBookTask(bookUid);
            if (taskId === 8) {
                finishedBook = true;
                log.logToFile(`Book finished!`);
                if (readUntilFinish) {
                    break;
                }

                let homeworkBooks = await userSession.requesticator.getHomeworks();

                if (!homeworkBooks.length) {
                    bookUid = await userSession.requesticator.getNewBook();
                    if (!bookUid) {
                        finishedAllBooks = true;
                        break;
                    };
                    await userSession.requesticator.getBookTask(bookUid);
                    homeworkBooks = await userSession.requesticator.getHomeworks();
                }
                bookUid = homeworkBooks[0].bookId;
                bookName = homeworkBooks[0].title;
                log.logToFile(`New Book UID: ${bookUid}\nNew Bookname: ${bookName}`);

                continue;
            }

            const bookTextObj = await userSession.requesticator.getBookText(bookUid, taskId);
            const bookText = bookTextObj.paragraph;
            const wordCount = bookTextObj.wordCount;
            if (settings.wpm) {
                const totalTime = (wordCount / settings.wpm) * 60;
                await progressUpdater.wait(totalTime, `"Reading" at ${settings.wpm} Words Per Minute`, shouldStop);
            }

            log.logToFile(`About to get AI Answer`);
            const results = await getAIanswer(
                () => userSession.requesticator.answerQuestion(bookText, taskId, true),
                queue,
                userSession.interaction,
                progressUpdater,
                60000,
                3000,
                () => progressUpdater.cancelled
            );

            if (await shouldStop()) {
                break;
            }

            const experienceGained = results?.experience ?? 0;

            pointsAcquired += experienceGained;

            if (results?.results) {
                for (const result of results.results) {
                    correctQuestions += result.score;
                    totalQuestions += result.total;
                }
            }

            timesO += 1;
            if (experienceGained !== 0) {
                log.logToFile('Got questions right!');
                await progressUpdater.updateProgressBar(0, pointsAcquired, settings.srp);
                await progressUpdater.updateEmbed(`Completing Questions...`);
                timesO = 0;
            } else {
                log.logToFile('Got questions wrong!');
                await progressUpdater.updateEmbed(`Retrying Question...`);
            }
        }
    } catch (err) {
        log.logToFile("Error caught");
        log.logToFile(err);
        logError(err, null, 'Sparx Reader');
    }

    await log.send(userSession.interaction.user);

    let finalMessage = 'Encountered an error causing the autocompleter to fail';
    if (finishedAllBooks) {
        finalMessage = 'No more books to read';
    }
    else if (progressUpdater.cancelled) {
        finalMessage = 'Cancelled';
    }
    else if (pointsAcquired >= settings.srp && !readUntilFinish) {
        finalMessage = `SRP target of ${settings.srp} has been achieved`;
    }
    else if (finishedBook && readUntilFinish) {
        finalMessage = 'The book has been Finished';
    }

    log.logToFile(`Final Message: ${finalMessage}`);

    await progressUpdater.updateEmbed(finalMessage);
    await progressUpdater.end();
    return (process.hrtime(progressUpdater.taskTimer))[0];
}

module.exports = autocomplete;