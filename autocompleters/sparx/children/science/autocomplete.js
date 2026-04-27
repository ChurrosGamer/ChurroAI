const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { emojis, colours } = require('../../../../config.json');
const fakeTimeSetting = {};
const SparxParser = require('./parser.js');
const { appendToDB, updateDB, getFromDB, deleteEntryDB } = require('../../../../database/general.js');
const { logError } = require('../../../../utils/errorLogger.js');
const progressTracker = require('../../../../utils/progressTracker.js');
const formatTime = require('../../../../utils/formatTime');
const getProgressBar = require('../../../../utils/getProgressBar');
const getAIanswer = require('../../../../utils/getAIanswer.js');
const logger = require('../../../../utils/logger.js');
const { checkAccount } = require('../../../../database/accounts.js');
const convertAItoObject = require('../../../../utils/convertAItoObject.js');
const isHigherModel = require('../../../../utils/isHighestModel.js');
const queues = require('../../../../queues/queues.js');

class sparxScienceAutocompleter {
    constructor(sparxScience, interaction) {
        this.sparxScience = sparxScience;
        this.interaction = interaction;
    }

    async answerQuestion(answerObject) {
        const questionResponse = await this.sparxScience.answerQuestion(answerObject);
        return questionResponse;
    }

    async readyQuestion(activity, token) {
        const questionResponse = await this.sparxScience.readyQuestion(activity, token);
        return questionResponse?.activity?.state?.token;
    }

}

async function sparxScienceAutocomplete(userSession) {
    const settings = userSession.settings;
    const interaction = userSession.interaction;
    const sparxScience = userSession.requesticator;
    const packageID = userSession.selectedHomework;
    const apikeys = (await checkAccount(interaction.user.id)).apikeys;
    const ai = convertAItoObject(userSession.settings.model);
    const log = new logger(userSession.interaction.user.id, 'sparx_science');
    sparxScience.log = log;
    log.logToFile('Logging Start');
    log.logToFile(`**Settings**\nFaketime Min: ${settings.min}\nFaktime Max: ${settings.max}`);
    fakeTimeSetting[interaction.user.id] = { min: settings.min, max: settings.max, total: 0 };

    const queueScience = queues.get('sparx_science');
    const parser = new SparxParser(apikeys);

    const taskTimer = process.hrtime();

    const cancel = new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('Cancel')
        .setEmoji(emojis.x)
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder()
        .addComponents(cancel);

    const sparxScienceExecuter = new sparxScienceAutocompleter(sparxScience, interaction);

    const initialEmbed = new EmbedBuilder()
        .setColor(colours.sparx_science)
        .setTitle('Sparx Science Autocompleter')
        .setDescription(`\`Starting Questions...\``);

    const getTimeField = function () {
        return `> **Time Spent**: ${formatTime((process.hrtime(taskTimer))[0])}`;
    };
    const progressUpdater = new progressTracker(interaction, getTimeField);

    try {

        let homeworkTasks = await sparxScience.getTaskItems(packageID);
        if ((homeworkTasks.package.contents.tasks.length === 0)) {
            await sparxScience.generateTaskItems(packageID);
            homeworkTasks = await sparxScience.getTaskItems(packageID);
        }

        const sectionsProgress = [];
        const tasksScores = [];
        let currentGroup = [];
        for (const task of homeworkTasks.package.contents.tasks) {
            let totalCorrect = 0;
            let total;
            if (task.type === 'flashcards') {
                let correct = task?.state?.completion?.progress?.C ?? 0;
                let halfCorrect = task?.state?.completion?.progress?.FNR ?? 0;
                totalCorrect = correct + (halfCorrect * 0.5);
                total = task?.state?.completion?.size ?? 10;
            } else {
                totalCorrect = 0;
                total = task.contents.skillsTask.taskItems.length;
                for (const skillTask of task.contents.skillsTask.taskItems) {
                    if (skillTask.state.completed) totalCorrect++;
                }
            }

            const progressEntry = {
                name: task.title,
                value: getProgressBar(totalCorrect, total)
            };

            tasksScores.push({ totalCorrect, total });

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

        if (await progressUpdater.start(initialEmbed, row, sectionsProgress)) return;

        log.logToFile(homeworkTasks.package.contents.tasks);
        const shouldStop = async () => progressUpdater.cancelled || !(await queueScience.stillUsing(interaction.user.id));
    
        for (const task of homeworkTasks.package.contents.tasks) {
            if (await shouldStop()) break;
            await progressUpdater.updateEmbed(`Moving onto Task ${task.taskIndex + 1}...`);
            log.logToFile(`Moving onto Task ${task.taskIndex + 1}...`);
            let index = 0;
            for (const skillTask of task.contents.skillsTask.taskItems) {
                if (await shouldStop()) break;
                index++;
                if (skillTask.state.completed) continue;
                let stayOnQuestion = true;
                let aiModel = ai[0];
                log.logToFile(`Task type: ${task.type}`);
                let isFlashcard = task.type === 'flashcards';
                let timesIncorrect = 0;
                let timesO = 0;
                let supportMaterial = '';
                while (stayOnQuestion && timesO < 20) {
                    timesO += 1;
                    if (isFlashcard) {
                        await progressUpdater.updateEmbed(`Completing Flashcards at Task ${task.taskIndex + 1}...`);
                        log.logToFile(`Completing Flashcards at Task ${task.taskIndex + 1}...`);
                    } else if (aiModel === ai[0]) {
                        await progressUpdater.updateEmbed(`Completing Question ${index} at Task ${task.taskIndex + 1}...`);
                        log.logToFile(`Completing Question ${index} at Task ${task.taskIndex + 1}...`);
                    } else {
                        await progressUpdater.updateEmbed(`Retrying Question ${index} at Task ${task.taskIndex + 1}...`);
                        log.logToFile(`Retrying Question ${index} at Task ${task.taskIndex + 1}...`);
                    }
                    const questionActivity = await sparxScience.getQuestionActivity(skillTask.name);
                    log.logToFile(questionActivity);
                    const activityName = questionActivity.activity.name;
                    let token = questionActivity.activity.state.token;
                    const question = await sparxScience.getQuestion(questionActivity.activity.name);
                    if (!question?.activity?.state?.skillActivity?.question?.questionJson) break;
                    const questionLayout = JSON.parse(question.activity.state.skillActivity.question.questionJson);

                    const readyResponse = await sparxScienceExecuter.readyQuestion(activityName, token);
                    if (readyResponse) {
                        token = readyResponse;
                    }

                    await progressUpdater.wait(settings, isFlashcard ? `Waiting to Complete Flashcards at Task ${task.taskIndex + 1}` : `Waiting to Complete Question ${index} at Task ${task.taskIndex + 1}`, shouldStop);

                    let aiAnswered = await getFromDB('sparx_science', 'question', JSON.stringify(questionLayout), 'answer');
                    let alreadyInDB;

                    if (!aiAnswered && !ai[0]) {
                        stayOnQuestion = false;
                        break;
                    }

                    let failedQuestion = null;
                    let shouldTry = true;
                    if (!aiAnswered) {
                        failedQuestion = await getFromDB('sparx_science_failed', 'question', JSON.stringify(questionLayout));

                        log.logToFile('Failed question', failedQuestion);
                        if (failedQuestion) {
                            let nextBetterModel = null;

                            for (const item of Object.values(ai)) {
                                if (!item) break;
                                const model = `gemini-${item}`;

                                if (isHigherModel(model, failedQuestion.ai_model)) {
                                    nextBetterModel = item;
                                    break;
                                }
                            }

                            if (!nextBetterModel) shouldTry = false;
                            if (nextBetterModel) aiModel = nextBetterModel;
                        }
                    }

                    log.logToFile('Should try', shouldTry);
                    if (!shouldTry) {
                        break;
                    }

                    log.logToFile('AI Answer before checks', JSON.stringify(aiAnswered, null, 2));
                    if (!aiAnswered) {
                        log.logToFile('Trying to run AI Model', aiModel);

                        aiAnswered = await getAIanswer(
                            () => parser.parse(questionLayout[questionLayout.length - 1], aiModel, activityName, token, supportMaterial, failedQuestion?.incorrect_answers),
                            queueScience,
                            interaction,
                            progressUpdater,
                            60000,
                            3000,
                            () => progressUpdater.cancelled
                        );

                        log.logToFile("AI Answer:");
                        log.logToFile(aiAnswered.action.answer.components);

                    } else {
                        alreadyInDB = true;
                        aiAnswered = parser.getQuestionObject(JSON.parse(aiAnswered), activityName, token);
                        log.logToFile("DB Answer:");
                        log.logToFile(aiAnswered.action.answer.components);
                    }

                    if (await shouldStop()) {
                        break;
                    }

                    let errorCode = await sparxScienceExecuter.answerQuestion(aiAnswered);
                    log.logToFile('Question response after AI Answered', errorCode);
                    if (errorCode === 9) {
                        const readyResponse = await sparxScienceExecuter.readyQuestion(activityName, token);
                        if (readyResponse) {
                            token = readyResponse;
                            aiAnswered.token = token;
                        }
                        log.logToFile('About to input for twice', aiAnswered);
                        errorCode = await sparxScienceExecuter.answerQuestion(aiAnswered);
                        log.logToFile(`Error code twice`);
                        log.logToFile(errorCode);
                    }
                    // await progressUpdater.updateProgressBar(packageID, taskTimer);
                    let continuousRetry = errorCode.activity?.annotations?.multistep_type === "continuous";
                    log.logToFile(`Continious retry ${continuousRetry}`); // Need to check for flashcards if correct
                    let questionSuccecceed;
                    if (isFlashcard) { // marks
                        questionSuccecceed = errorCode.packageUpdate.contents.tasks[task.taskIndex].contents.skillsTask.taskItems[index - 1].state.marks === 1;
                        if (task?.state?.completion?.progress?.C !== errorCode.packageUpdate.contents.tasks[task.taskIndex].state?.completion?.progress?.C) {
                            task.state.completion.progress.C = errorCode.packageUpdate.contents.tasks[task.taskIndex].state?.completion.progress.C;
                            tasksScores[task.taskIndex].totalCorrect += 1;
                        } else if (task?.state?.completion?.progress?.FNR !== errorCode.packageUpdate.contents.tasks[task.taskIndex].state?.completion?.progress?.FNR) {
                            task.state.completion.progress.FNR = errorCode.packageUpdate.contents.tasks[task.taskIndex].state?.completion.progress.FNR;
                            tasksScores[task.taskIndex].totalCorrect += 0.5;
                        }
                    } else {
                        questionSuccecceed = errorCode.packageUpdate.contents.tasks[task.taskIndex].contents.skillsTask.taskItems[index - 1].state.status === 1;
                        if (questionSuccecceed) tasksScores[task.taskIndex].totalCorrect += 1;
                    }
                    log.logToFile('Question Succedded', questionSuccecceed);
                    if (errorCode.activity.state.skillActivity.question?.supportMaterial) {
                        supportMaterial = errorCode.activity.state.skillActivity.question.supportMaterial?.text;
                    }

                    if (alreadyInDB && !questionSuccecceed) {
                        await deleteEntryDB('sparx_science', 'question', JSON.stringify(questionLayout));
                    }
                    log.logToFile('Support Material', supportMaterial); // supportMaterial

                    log.logToFile('Task Score', tasksScores[task.taskIndex]);
                    await progressUpdater.updateProgressBar(task.taskIndex, tasksScores[task.taskIndex].totalCorrect, tasksScores[task.taskIndex].total);
                    log.logToFile('Stay questions', (aiModel === ai[1]), !(isFlashcard && questionSuccecceed), !continuousRetry);
                    if (aiModel === ai[1] && (timesIncorrect > 3 || isFlashcard) && !(isFlashcard && questionSuccecceed) && (timesIncorrect > 5 || !continuousRetry)) {
                        stayOnQuestion = false;
                    }

                    if (questionSuccecceed) {
                        if (!alreadyInDB) {
                            log.logToFile("Adding science question to db");
                            await appendToDB('sparx_science', {question: questionLayout, answer: aiAnswered.action.answer.components});
                        }
                        timesIncorrect = 0;
                        aiModel = ai[0];
                    } else {
                        log.logToFile('Failed question after question succedded wrong', failedQuestion);
                        if (!failedQuestion) {
                            await appendToDB('sparx_science_failed', {question: JSON.stringify(questionLayout), incorrect_answers: [aiAnswered.action.answer.components], ai_model: aiModel});
                        } else {
                            failedQuestion.incorrect_answers.push(aiAnswered.action.answer.components);
                            log.logToFile('Failed questions updated: ', failedQuestion.incorrect_answers);
                            await updateDB('sparx_science_failed', {incorrect_answers: failedQuestion.incorrect_answers, ai_model: aiModel }, 'question', questionLayout);
                        }
                        timesIncorrect += 1;
                        aiModel = ai[1];
                        if (!aiModel) {
                            stayOnQuestion = false;
                        }
                        log.logToFile("Question was wrong or already in db");
                    }
                }
            }
        }

    } catch (err) {
        log.logToFile("Sparx science error");
        log.logToFile(err);
        logError(err, null, 'Sparx Science');
    } finally {
        await log.send(userSession.interaction.user);

        await progressUpdater.updateEmbed('Finished');
        await progressUpdater.end();
    }
    return (process.hrtime(taskTimer))[0];
}

module.exports = sparxScienceAutocomplete;