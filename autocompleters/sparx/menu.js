const { MessageFlags, LabelBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
// const autocomplete = require('./autocomplete');
const { checkAccount } = require('../../database/accounts');
const positiveNounChanger = require('./positiveNounChanger');
const autocompleteWrapper = require('../../utils/autocompleteWrapper');

async function menu(userSession) {
    
    // console.log('Usersession', userSession);
    await userSession.init();
    const userAccount = await checkAccount(userSession.interaction.user.id);
    // console.log(userAccount[`sparx_${userSession.platform}_settings`]);
    await userSession.loadFromObject({settings: userAccount[`sparx_${userSession.platform}_settings`]});
    const hwMessage = await userSession.updateEmbed();
    const collector = hwMessage.createMessageComponentCollector({
        time: 600_000
    });

    collector.on('collect', async (interaction) => {
        if (interaction.isStringSelectMenu() && interaction.customId === 'select_homework') {
            await interaction.deferUpdate();
            userSession.selectedHomework = interaction.values[0];
            await userSession.updateEmbed();
            return;
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'start') {
                await interaction.deferUpdate();
                await userSession.updateEmbed(true);
                const autocomplete = require(`./children/${userSession.platform}/autocomplete`);
                const queueToUse = require(`./children/${userSession.platform}/queue.js`);
                const platform = `sparx(${userSession.platform})`;
                await queueToUse.addQueue({
                    action: async () => {
                        return await autocompleteWrapper(
                            interaction, 
                            platform, 
                            userSession, 
                            () => autocomplete(userSession)
                        );
                    },
                    id: interaction.user.id,
                    interaction: interaction
                });
            } else if (interaction.customId === 'save_account') {
                const modal = new ModalBuilder()
                    .setCustomId(`save_account_sparx(${userSession.platform})`)
                    .setTitle(`Save Account`);
                const input = new TextInputBuilder()
                    .setCustomId('master_password')
                    .setLabel('Master Password')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);
            } else if (interaction.customId === 'tag_changer') { 
                await positiveNounChanger(interaction, userSession);
            } else if (interaction.customId === 'mode') {
                const modal = new ModalBuilder()
                    .setCustomId(`autocompleterModule_sparx(reader)_changeMode`)
                    .setTitle(`Mode`);
                const typeInput = new StringSelectMenuBuilder()
                    .setCustomId('type')
                    .setPlaceholder("Choose a Mode")
                    .addOptions(
                        { label: "Read Until Points Target Achieved", value: "Read Until Points Target Achieved" },
                        { label: "Read Until Book Completed", value: "Read Until Book Completed" }
                    );
                const typeLabel = new LabelBuilder({
                    label: 'Mode Type',
                    component: typeInput
                });

                modal.addLabelComponents(typeLabel);
                await interaction.showModal(modal);
            } else if (interaction.customId === 'settings') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const { handleSetting } = require(`./children/${userSession.platform}/settings`);
                await handleSetting(interaction, userAccount[`sparx_${userSession.platform}_settings`]);
            } else if (interaction.customId === 'independent_learning') {
                if (userSession.platform === 'maths') {
                    const modal = new ModalBuilder()
                        .setCustomId(`autocompleterModule_sparx(maths)_independant_learning`)
                        .setTitle('Independant Learning Code');

                    const curriculums = await userSession.requesticator.listCurriculumSummaries({
                        "includeHidden": false,
                        "subjectName": ""
                    });

                    const curriculumInput = new StringSelectMenuBuilder()
                        .setCustomId('curriculum')
                        .setPlaceholder("Curriculum");

                    for (const cur of curriculums.curriculumSummaries) {
                        // console.log(cur.curriculum.displayName, cur.curriculum.name);
                        curriculumInput.addOptions({ label: cur.curriculum.displayName, value: cur.curriculum.name });
                    }

                    const levelInput = new StringSelectMenuBuilder()
                        .setCustomId('level')
                        .setPlaceholder("Level")
                        .addOptions(
                            { label: "Level 1", value: "1" },
                            { label: "Level 2", value: "2" },
                            { label: "Level 3", value: "3" },
                            { label: "Level 4", value: "4" },
                            { label: "Level 5", value: "5" }
                        );

                    const curriculumLabel = new LabelBuilder({
                        label: 'Curriculum',
                        component: curriculumInput
                    });
                    const levelLabel = new LabelBuilder({
                        label: 'Level',
                        component: levelInput
                    });

                    const cookieInput = new TextInputBuilder()
                        .setCustomId('code')
                        .setLabel('Code')
                        .setStyle(TextInputStyle.Short);

                    modal.addLabelComponents(curriculumLabel);
                    modal.addComponents(new ActionRowBuilder().addComponents(cookieInput));
                    modal.addLabelComponents(levelLabel);
                    await interaction.showModal(modal);
                }
            } else if (interaction.customId === 'xp_farming') {
                await interaction.deferUpdate();
                const curriculums = await userSession.requesticator.listCurriculumSummaries({
                    "includeHidden": false,
                    "subjectName": ""
                });

                const curriculumInput = new StringSelectMenuBuilder()
                    .setCustomId('curriculum')
                    .setPlaceholder("Curriculum");

                for (const cur of curriculums.curriculumSummaries) {
                    // console.log(cur.curriculum.displayName, cur.curriculum.name);
                    curriculumInput.addOptions({ label: cur.curriculum.displayName, value: cur.curriculum.name });
                }
                const curriculum = curriculums.curriculumSummaries.find(cur => cur.curriculum.displayName === 'GCSE');
                const curriculumId = curriculum.curriculum.name;

                const topicSummariesRequest = {
                    "topicParent": curriculumId,
                    "options": {
                        "includeLearningPaths": true,
                        "omitKeyQuestions": true,
                        "omitTopicLinks": false,
                        "includeAllQuestions": false,
                        "includeQuestionLayoutJson": false,
                        "includeSkillFlagsAndTags": false
                    }
                };

                const topicSummaries = await userSession.requesticator.listTopicSummariesRequest(topicSummariesRequest);
                const queue = require('./children/maths/queue');
                const autocomplete = require('./children/maths/autocomplete');
                queue.changeFarmingStatus(interaction.user.id, 'ongoing');
                let farmingBlocked = false;
                for (const summary of topicSummaries.topicSummaries) {
                    if (farmingBlocked) break;
                    for (const learningPath of summary.learningPaths) {
                        const specName = learningPath.specName;
                        const learningUnitNames = learningPath.learningUnitNames;

                        const packagesActive = {
                            "curriculumName": curriculumId,
                            "topicLevelName": specName,
                            "objectiveNames": learningUnitNames
                        };

                        const packagesResponse = await userSession.requesticator.getPackagesIndependantLearning(packagesActive);
                        const packageId = packagesResponse.packages[0].packageId;

                        if (!packageId) {
                            continue;
                        }
                        userSession.selectedHomework = packageId;

                        userSession.selectRow.setDisabled(true);
                        await userSession.updateEmbed(true);
                        await queue.waitUntilNoUse(interaction.user.id);
                        const returnValue = await queue.addQueue({
                            action: async () => {
                                return await autocompleteWrapper(
                                    interaction, 
                                    'sparx(maths)', 
                                    userSession, 
                                    () => autocomplete(userSession)
                                );
                            },
                            id: interaction.user.id,
                            interaction: interaction,
                            farming: true
                        });
                        if (returnValue === 'blocked') {
                            farmingBlocked = true;
                            break;
                        }
                    }
                }
            }
        }
    });

    collector.on('end', async () => {
        await userSession.updateEmbed(true);
    });
}

module.exports = menu;