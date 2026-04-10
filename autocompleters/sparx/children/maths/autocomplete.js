const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags, AttachmentBuilder, ContainerBuilder, FileBuilder, TextDisplayBuilder } = require('discord.js');
const fs = require('fs').promises;
const { emojis, colours } = require('../../../../config.json');
const { parser, parseBookwork, parseBookworkData, parseQuestion } = require('./parser');
const { getBookworks, addToDbBookwork } = require('../../../../database/bookwork.js');
const { appendToDB, getFromDB, updateDB } = require('../../../../database/general.js');
const { getBookworkCheckAnswer } = require('./bookwork.js');
const { convertToPDF } = require('./latexPDF.js');
const { logError } = require('../../../../utils/errorLogger.js');
const progressTracker = require('../../../../utils/progressTracker.js');
const formatTime = require('../../../../utils/formatTime');
const getProgressBar = require('../../../../utils/getProgressBar');
const getAIanswer = require('../../../../utils/getAIanswer.js');
const logger = require('../../../../utils/logger.js');
const userAutocompleters = {};
const convertAItoObject = require('../../../../utils/convertAItoObject.js');
const { checkAccount } = require('../../../../database/accounts.js');
const isHigherModel = require('../../../../utils/isHighestModel.js');

function stripWorkingOut(obj) {
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
        if (
            typeof value === "object" &&
            value !== null &&
            "answer" in value &&
            "working_out" in value
        ) {
            // Only keep the answer if it's split like this
            result[key] = value.answer;
        } else {
            // Leave untouched if structure doesn't match
            result[key] = value;
        }
    }

    return result;
}

function getWorkingOutData(arr) {
    const index = arr.findIndex(item => item.key === 'WORKING OUT');

    let workingOut;
    if (index !== -1) {
        workingOut = arr[index].value;
        arr.splice(index, 1);
    }

    return workingOut;
}


class sparxMathsAutocompleter {
    constructor(sparxMaths, interaction, packageID, fakeTimeSettings, log, pdfSettings) {
        this.sparxMaths = sparxMaths;
        this.interaction = interaction;
        this.packageID = packageID;
        this.log = log;
        this.currentBookmark = null;
        this.bookmarks = {};
        this.pdfSettings = pdfSettings;
        this.startTimestamp = Math.floor(Date.now() / 1000);
        this.totalFakeTime = 0;
        this.fakeTimeSettings = fakeTimeSettings;
    }

    async sendBookWork() {

        const bookworkRow = await getBookworks(this.packageID);
        let bookworksObj = {};
        if (Array.isArray(bookworkRow.bookworks)) {
            bookworkRow.bookworks = '{}';
        };

        try {
            bookworksObj = JSON.parse(bookworkRow.bookworks || '{}');
        } catch (err) {
            console.error("Failed to parse bookworks:", err);
        }

        const pdfAttachment = await convertToPDF(bookworksObj, this.packageID, this.pdfSettings.working_out, this.pdfSettings.question);
        let fileExists = false;
        if (pdfAttachment) {
            fileExists = await fs.access(pdfAttachment).then(() => true).catch(() => false);
        }

        if (fileExists) {
            const attachment = new AttachmentBuilder(pdfAttachment, { name: 'results.pdf' });
            const container = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Session Finished!'))
                .addFileComponents(new FileBuilder().setURL('attachment://results.pdf'));
            
            await this.interaction.user.send({ 
                files: [attachment], 
                components: [container], 
                flags: MessageFlags.IsComponentsV2 
            });
            
            await fs.unlink(pdfAttachment);
        } else {
            await this.interaction.user.send({
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('# Session Finished!\nCould not generate a PDF of the bookwork codes.')
                    )
                ]
            });
        }
    }

    async addAnswer(answer) {
        this.bookmarks[this.currentBookmark] = answer;
        await addToDbBookwork(this.packageID, { [this.currentBookmark]: this.bookmarks[this.currentBookmark] });
    }

    async readyBookwork(activityIndex) {
        const readyObj = {
            "activityIndex": activityIndex,
            "action": {
                "oneofKind": "wac",
                "wac": {
                    "actionType": 0,
                    "extraData": {}
                }
            },
            "timestamp": this.getTimestamp()
        };

        await this.sparxMaths.readyQuestion(readyObj);
    }

    async readyQuestion(questionIndex, activityIndex) {
        const readyObj = {
            "activityIndex": activityIndex,
            "action": {
                "oneofKind": "question",
                "question": {
                    "questionIndex": questionIndex,
                    "actionType": 0
                }
            },
            "timestamp": this.getTimestamp()
        };

        return await this.sparxMaths.readyQuestion(readyObj);
    }

    async answerQuestion(answerObject, sparxMathsExecuter, working_out, question) {
        const answerResponse = await this.sparxMaths.answerQuestion(answerObject);
        this.log.logToFile('---');
        this.log.logToFile(answerResponse);
        if (answerResponse.response.status === 'SUCCESS') {
            if (answerObject.action.oneofKind === 'wac') {
                return true;
            }

            const result = answerResponse.response.givenAnswerXML
                .replace(/<[^>]*>/g, ' ') // replace tags with spaces
                .replace(/\s+/g, ' ')     // normalize multiple spaces
                .trim();                   // remove leading/trailing spaces

            await sparxMathsExecuter.addAnswer({ answer: result, working_out, question });
            return true;
        }

        return false;

    }

    async answerTimesTable(activityIndex) {
        const timesTableInput = {
            "activityIndex": activityIndex,
            "action": {
                "oneofKind": "game",
                "game": {
                    "action": {
                        "oneofKind": "tablesAnswer",
                        "tablesAnswer": {
                            "answers": [
                                {
                                    "questionText": "6x5=?,30",
                                    "answerText": "30",
                                    "correct": true,
                                    "timedOut": false,
                                    "timeTaken": 2.959,
                                    "game": "100club",
                                    "enterCorrectionPhase": false,
                                    "leaveCorrectionPhase": false,
                                    "inputString": "0",
                                    "questionGap": 1000,
                                    "badData": false,
                                    "questionSetID": "tables",
                                    "deliveryMechanism": "basicKeypad",
                                    "target": false,
                                    "numPendingTalkAndLearns": 0,
                                    "context": 1,
                                    "didNotKnow": false,
                                    "indexWithinQuiz": 0,
                                    "talPromptType": "",
                                    "secondChance": false,
                                    "talCycleCount": 0,
                                    "indexWithinGameSession": 0,
                                    "isEndOfQuiz": false,
                                    "answerTime": this.getTimestamp()
                                }
                            ]
                        }
                    }
                }
            },
            "timestamp": this.getTimestamp()
        };

        await this.sparxMaths.answerTimesTable(timesTableInput);
    }

    async startTimesTable(packageId, taskIndex) {
        const timesTableInput = {
            "activityType": 3,
            "payload": {
                "oneofKind": "gameID",
                "gameID": "HundredClub"
            },
            "method": 0,
            "clientFeatureFlags": {},
            "taskItem": {
                "packageID": packageId,
                "taskIndex": taskIndex,
                "taskItemIndex": 0,
                "taskState": 0
            },
            "timestamp": this.getTimestamp()
        };

        const timestableStarted = await this.sparxMaths.startTimesTable(timesTableInput);
        return timestableStarted.activityIndex;
    }

    getTimestamp(addToUser) {
        // Random offset in seconds
        let offset = Math.floor(Math.random() * (this.fakeTimeSettings.max - this.fakeTimeSettings.min + 1)) + this.fakeTimeSettings.min;
        this.startTimestamp += offset;
        if (addToUser) {
            this.totalFakeTime += offset;
        }

        // Random 3-digit number 100-999, then append six zeros
        const nanos = (Math.floor(Math.random() * 900) + 100) * 1_000_000;

        this.log.logToFile(`Time recorded is ${this.startTimestamp} and ${addToUser}`);

        return {
            "seconds": this.startTimestamp,
            "nanos": nanos
        };
    }

}

async function checkDB(question, activityIndex, questionIndex, interaction) {
    const answer = await getFromDB('sparx_maths', 'question', question, 'answer');
    if (!answer) {
        return answer;
    }

    const answerObject = {
        "activityIndex": activityIndex,
        "action": {
            "oneofKind": "question",
            "question": {
                "questionIndex": questionIndex,
                "actionType": 1,
                "answer": {
                    "components": answer,
                    "hash": ""
                }
            }
        },
        "timestamp": userAutocompleters[interaction.user.id].getTimestamp(true)
    };

    return answerObject;
}

async function sparxMathsAutocomplete(userSession) {
    const settings = userSession.settings;
    const interaction = userSession.interaction;
    const sparxMaths = userSession.requesticator;
    const packageID = userSession.selectedHomework;
    const apikey = (await checkAccount(interaction.user.id)).apikeys;
    const ai = convertAItoObject(userSession.settings.model);
    const log = new logger(userSession.interaction.user.id, 'sparx_maths');
    sparxMaths.log = log;
    log.logToFile('Logging Start');
    log.logToFile(`**Settings**\nFaketime Min: ${settings.min}\nFaktime Max: ${settings.max}\nPDF Settings: ${JSON.stringify(settings.pdfSettings, null, 2)}`);
    const queueMaths = require('./queue.js');

    const taskTimer = process.hrtime();

    const cancel = new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('Cancel')
        .setEmoji(emojis.x)
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder()
        .addComponents(cancel);

    const initialEmbed = new EmbedBuilder()
        .setColor(colours.sparx_maths)
        .setTitle('Sparx Maths Autocompleter')
        .setDescription(`\`Starting Questions...\``);

    // const packageID = interaction.values[0];
    const wantWorkingOut = settings.pdfSettings.working_out;
    const sparxMathsExecuter = new sparxMathsAutocompleter(sparxMaths, interaction, packageID, { min: settings.min, max: settings.max }, log, settings.pdfSettings);
    userSession.sparxMathsExecuter = sparxMathsExecuter;
    userAutocompleters[interaction.user.id] = sparxMathsExecuter;
    let errorOccured = false;

    const tasks = await sparxMaths.getTasks(packageID);
    const sectionsProgress = [];
    let currentGroup = [];
    for (const task of tasks.tasks) {
        let progressEntry = {
            name: task.title
        };
        if (task.title.endsWith('Times Tables')) {
            progressEntry.value = await getProgressBar(task.completion.progress.C, task.completion.size);
        } else {
            progressEntry.value = await getProgressBar(task.numTaskItemsDone, task.numTaskItems);
        }

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

    // updateEmbederExecuter = new updateEmbeder(sparxMaths, packageID, new EmbedBuilder(anotherEmbed), targetMessage, row, queueMaths, interaction, taskTimer);

    const getTimeField = function () {
        return `> **Time Spent**: ${formatTime((process.hrtime(taskTimer))[0])}\n> **Time Simulated**: ${formatTime(sparxMathsExecuter.totalFakeTime)}`;
    };
    const progressUpdater = new progressTracker(interaction, getTimeField);
    try {

        if (await progressUpdater.start(initialEmbed, row, sectionsProgress)) return;
        const shouldStop = async () => progressUpdater.cancelled || !(await queueMaths.stillUsing(interaction.user.id));

        for (const task of tasks.tasks) {

            if (await shouldStop()) break;
            await progressUpdater.updateEmbed(`Moving on to Task ${task.taskIndex}...`);
            log.logToFile(`Moving on to Task ${task.taskIndex}...`);

            if (task.title.endsWith('Times Tables') && (task.completion.size > (task.completion?.progress?.C ?? 0))) {
                log.logToFile('Timestable detected');
                await progressUpdater.updateEmbed(`Completing Times Table...`);

                let activityIndex = await sparxMathsExecuter.startTimesTable(packageID, task.taskIndex);
                for (let i = 0; i < 50; i++) {
                    await sparxMathsExecuter.answerTimesTable(activityIndex);
                    // activityIndex++;
                }
                await progressUpdater.updateProgressBar(task.taskIndex - 1, 1, 1);
                continue;
            }

            const taskItems = await sparxMaths.getTasksItems(packageID, task.taskIndex);

            let index = 1;

            while (true) {

                if (taskItems[index - 1]?.status === 1) {
                    index++;
                    continue;
                } else if (taskItems[index - 1]?.status === undefined) {
                    break;
                }

                const item = await sparxMaths.getActivity(sparxMathsExecuter.getTimestamp(), packageID, task.taskIndex, index);
                if (item === 'break') break;

                async function completeBookwork(item) {
                    if (!item || item?.payload?.oneofKind === undefined) {
                        const bookworkInitialData = await sparxMaths.getActivity(sparxMathsExecuter.getTimestamp(), packageID, task.taskIndex, index, 1);

                        let activityIndex = bookworkInitialData.activityIndex;

                        if (await progressUpdater.updateEmbed(`Answering Bookwork Check...`));

                        const bookmarks = stripWorkingOut(JSON.parse((await getBookworks(packageID)).bookworks));

                        const bookmarksCorrectAnswer = await parseBookworkData(bookworkInitialData.payload.wac, bookmarks);
                        if (bookmarksCorrectAnswer) { // bookmarksCorrectAnswer
                            log.logToFile(bookmarksCorrectAnswer);
                            const bookworkAnswer = parseBookwork(activityIndex, bookmarksCorrectAnswer, interaction);
                            await sparxMathsExecuter.readyBookwork(activityIndex);
                            log.logToFile('!!!');
                            log.logToFile(bookworkAnswer);
                            await sparxMathsExecuter.answerQuestion(bookworkAnswer, sparxMathsExecuter);
                            return true;
                        }

                        log.logToFile("Bookwork not found in the stuff");
                        let commonAnswersPrevious = [];

                        let counterComplete = 0;
                        while (commonAnswersPrevious.length !== 1 && counterComplete < 15) {
                            const data = await sparxMaths.getActivity(sparxMathsExecuter.getTimestamp(), packageID, task.taskIndex, index, 1);
                            activityIndex = data.activityIndex;
                            const commonAnswers = getBookworkCheckAnswer(data, commonAnswersPrevious);
                            commonAnswersPrevious = commonAnswers;

                            counterComplete++;
                        }

                        const bookworkAnswer = parseBookwork(activityIndex, commonAnswersPrevious[0], interaction);
                        await sparxMathsExecuter.readyBookwork(activityIndex);
                        await sparxMathsExecuter.answerQuestion(bookworkAnswer, sparxMathsExecuter);

                        return true;
                    }

                    return false;
                }

                if (await completeBookwork(item)) continue;

                if (await shouldStop()) break;

                await progressUpdater.updateEmbed(`Starting Question ${index} at Task ${task.taskIndex}...`);
                log.logToFile(`Starting Question ${index} at Task ${task.taskIndex}...`);
                if (taskItems[index - 1].status === 1) {
                    await progressUpdater.updateEmbed(`Question ${index} at Task ${task.taskIndex} already finished, moving onto next question...`);
                    log.logToFile(`Question ${index} at Task ${task.taskIndex} already finished, moving onto next question...`);
                    index++;
                    continue;
                }
                sparxMathsExecuter.currentBookmark = item.payload.question.bookworkCode;

                /*
                if (taskItems[index-1].status !== 1) {
                    sparxMathsExecuter.currentBookmark = item.payload.question.bookworkCode;
                    await sparxMathsExecuter.questionCompleter(item, index);
                }
                */

                // await sparxMathsExecuter.questionCompleter(item, index); question.bookworkCode

                async function attemptQuestion(attempts = 1) {
                    if (await shouldStop()) return 'break';
                    const item = await sparxMaths.getActivity(sparxMathsExecuter.getTimestamp(), packageID, task.taskIndex, index); // NEED TO GET ACTIVITY INDEX RIGHT, same as questionIndex I think. or its actually the increment by one
                    if (item === 'break') return 'break';
                    if (await completeBookwork(item)) return 'continue';
                    let model = ai[attempts-1];
                    if (!model && attempts > 1) return 'blank';
                    const activityIndex = item.activityIndex; // Fuck everything I said on the previous comment, I have no clue
                    const questionIndex = item.payload.question.questionIndex;
                    const questionLayout = JSON.parse(item.payload.question.questionSpec);

                    log.logToFile(item);

                    await sparxMathsExecuter.readyQuestion(questionIndex, activityIndex);

                    let shouldTry = true;
                    let workingOut;
                    let questionObjectSend = await checkDB(item.payload.question.questionSpec, activityIndex, questionIndex, interaction);
                    let failedQuestion = null;
                    if (questionObjectSend) {
                        workingOut = await getFromDB('sparx_maths', 'question', item.payload.question.questionSpec, 'working_out');
                    } else {
                        failedQuestion = await getFromDB('sparx_maths_failed', 'question', JSON.stringify(item.payload.question.questionSpec));
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
                            if (nextBetterModel) model = nextBetterModel;
                        }
                    }

                    let alreadyInDB = true;
                    if (!shouldTry) {
                        return 'blank';
                    }

                    if (!questionObjectSend && !ai[0] && shouldTry) {
                        return 'blank';
                    }

                    if (!questionObjectSend || (!workingOut && wantWorkingOut && ai[0])) {
                        alreadyInDB = false;
                        log.logToFile('Using AI Model', model);
                        questionObjectSend = await getAIanswer(
                            () => parser(apikey, questionLayout[0], activityIndex, questionIndex, model, interaction, failedQuestion?.incorrect_answers),
                            queueMaths,
                            interaction,
                            progressUpdater,
                            60000,
                            3000,
                            () => progressUpdater.cancelled
                        );
                    } else {
                        questionObjectSend.action.question.answer.components = questionObjectSend.action.question.answer.components.map(JSON.parse);
                    }

                    if (wantWorkingOut) {
                        workingOut = getWorkingOutData(questionObjectSend.action.question.answer.components);
                    }

                    log.logToFile(questionObjectSend?.action?.question?.answer?.components, 'Working out', workingOut); // addWorkingOut

                    const questionSuccess = await sparxMathsExecuter.answerQuestion(questionObjectSend, sparxMathsExecuter, workingOut, parseQuestion(questionLayout[0]));
                    if (questionSuccess) task.numTaskItemsDone++;
                    await progressUpdater.updateProgressBar(task.taskIndex - 1, task.numTaskItemsDone, task.numTaskItems);
                    if (questionSuccess && !alreadyInDB) {
                        await appendToDB('sparx_maths', {question: item.payload.question.questionSpec, answer: questionObjectSend.action.question.answer.components});
                        // Optionally save working out as well if you have it
                        if (workingOut) {
                            await updateDB('sparx_maths', {working_out: workingOut}, 'question', item.payload.question.questionSpec);
                        }
                    }
                    if (!questionSuccess) {
                        if (!failedQuestion) {
                            await appendToDB('sparx_maths_failed', {question: JSON.stringify(item.payload.question.questionSpec), incorrect_answers: [questionObjectSend.action.question.answer.components], ai_model: model});
                        } else {
                            failedQuestion.incorrect_answers.push(questionObjectSend.action.question.answer.components);
                            await updateDB('sparx_maths_failed', {incorrect_answers: failedQuestion.incorrect_answers}, 'question', item.payload.question.questionSpec);
                        }
                        if (attempts < 3) {
                            if (attempts === 1) {
                                if (await progressUpdater.updateEmbed(`Retrying Question ${index} at Task ${task.taskIndex}...`)) return 'break';
                            } else if (attempts === 2) {
                                if (await progressUpdater.updateEmbed(`Retrying Question ${index} at Task ${task.taskIndex} Again...`)) return 'break';
                            }
                            return await attemptQuestion(attempts + 1);
                        }
                    }
                }

                await progressUpdater.updateEmbed(`Answering Question ${index} at Task ${task.taskIndex}...`);
                const attemptQuestionResponse = await attemptQuestion();
                if (attemptQuestionResponse === 'break') {
                    break;
                } else if (attemptQuestionResponse === 'continue') {
                    continue;
                }
                index++; // move to the next index
            }
            await progressUpdater.updateEmbed(`Completed Section`);
        }
    } catch (err) {
        log.logToFile(err);
        logError(err, null, 'Sparx Maths');
        errorOccured = true;
    } finally {
        await log.send(interaction.user);

        try {
            await sparxMathsExecuter.sendBookWork();
        } catch (dmError) {
            console.error('Failed to send feedback DM:', dmError);
        }

        // Send feedback request embed if task completed successfully

        if (errorOccured) {
            await progressUpdater.updateEmbed(`An Unexpected Error has occured!`);
        } else {
            await progressUpdater.updateEmbed(`Finished`);
        }

        await progressUpdater.end();
    }
    return sparxMathsExecuter.totalFakeTime;
}

module.exports = sparxMathsAutocomplete;