const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { DynamicSessionGenerator } = require('./parser');
const progressTracker = require('../../utils/progressTracker');
const { emojis, colours } = require('../../config.json');
const getProgressBar = require('../../utils/getProgressBar');
const formatTime = require('../../utils/formatTime');
const logger = require('../../utils/logger.js');

async function autocomplete(userSession) {
    const log = new logger(userSession.interaction.user.id, 'seneca');
    log.logToFile('Logging Start');
    const settings = userSession.settings;
    log.logToFile('Settings', settings);

    const cancel = new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('Cancel')
        .setEmoji(emojis.x)
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder()
        .addComponents(cancel);

    const initialEmbed = new EmbedBuilder()
        .setColor(colours.seneca)
        .setTitle('Seneca Autocompleter')
        .setDescription(`\`Starting Questions...\``);

    const taskInfos = [];
    const sectionsProgress = [];
    let currentGroup = [];

    for (const sectionId of userSession.sectionIds) {
        const section = userSession.sectionStats.find(item => item.sectionId === sectionId) ?? { sectionId: sectionId, bestScore: 0 };

        const contentsUrl = await userSession.requesticator.get(`https://course.app.senecalearning.com/api/courses/${userSession.courseId}/signed-url?sectionId=${sectionId}&contentTypes=standard,hardestQuestions`, {
            "sectionId": sectionId,
            "contentTypes": "standard"
        });
        // console.log('Url', `https://course.app.senecalearning.com/api/courses/${userSession.courseId}/signed-url?sectionId=${sectionId}&contentTypes=standard,hardestQuestions`);

        const taskInfo = await userSession.requesticator.get(contentsUrl.url);
        taskInfos.push(taskInfo);

        const progressEntry = {
            name: taskInfo.title,
            value: getProgressBar(section.bestScore, 1)
        };

        // Push into current group
        currentGroup.push(progressEntry);

        // If group reaches 5, push it to the main array and start new group
        if (currentGroup.length === 5) {
            sectionsProgress.push(currentGroup);
            currentGroup = [];
        }
    }

    if (currentGroup.length > 0) {
        sectionsProgress.push(currentGroup);
    }

    const getTimeField = function () {
        return `> **Time Spent**: ${formatTime((process.hrtime(this.taskTimer))[0])}\n> **Time Simulated**: ${formatTime(this.totalSeconds)}`;
    };

    const progressUpdater = new progressTracker(userSession.interaction, getTimeField);
    if (await progressUpdater.start(initialEmbed, row, sectionsProgress)) return;

    for (const [index, taskInfo] of taskInfos.entries()) {
        if (progressUpdater.cancelled) break;
        await progressUpdater.updateEmbed(`Answering Questions for ${taskInfo.title}...`);
        await userSession.requesticator.startSession(userSession.courseId, taskInfo.id);

        const timeQuestions = [];
        let fakeTime = 0;
        for (let i = 0; i < 5; i++) {
            const timeTaken = Math.floor(Math.random() * (settings.max - settings.min + 1)) + settings.min;
            timeQuestions.push(timeTaken);
        }

        const generator = new DynamicSessionGenerator(taskInfo);

        const answerData = generator.generate({
            userId: userSession.userId,
            sessionId: userSession.requesticator.sessionId,
            durations: timeQuestions
        });

        const start = new Date(answerData.session.timeStarted);
        const finish = new Date(answerData.session.timeFinished);
        fakeTime += Math.floor((finish - start) / 1000);

        log.logToFile('Answer Data', JSON.stringify(answerData, null, 2));
        // console.log('Answer data', answerData);
        await userSession.requesticator.post('https://session.app.senecalearning.com/api/session', answerData);

        progressUpdater.totalSeconds += fakeTime;
        await progressUpdater.updateProgressBar(index, 1);
    }

    if (progressUpdater.cancelled) {
        await progressUpdater.updateEmbed(`Cancelled`);
    } else {
        await progressUpdater.updateEmbed(`Finished`);
    }

    await progressUpdater.end();
    await log.send(userSession.interaction.user);
    return progressUpdater.totalSeconds;
}

module.exports = autocomplete;