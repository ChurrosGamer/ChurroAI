require('dotenv').config();
const token = process.env.DISCORD_TOKEN;
const ADMIN_ROLE = process.env.ADMIN_ROLE;
const fs = require('node:fs');
const fspromise = require('fs').promises;
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
const { logError } = require('./utils/errorLogger.js');
const { executeViewAccounts, saveAccount } = require('./handlers/savedAccountsHandler.js');
const { createAccount } = require('./handlers/accountHandler.js');
const mainAccountLogin = require('./handlers/mainAccountLogin.js');
const { viewSavedAccounts, changeMasterPassword, updateAccountInteraction, changeSlots } = require('./handlers/accountManager.js');
const { handleApiKeyRequest } = require('./handlers/apikeyHandler.js');
const config = require('./config.json');
const imageSolverHandler = require('./imageSolver.js');
const util = require('util');
const getFile = require('./utils/getFile.js');
const getParent = require('./utils/getParent.js');
const processSettings = require('./generic/processSettings.js');
const seperateParentChild = require('./utils/seperateParentChild.js');
const processLogin = require('./generic/processLogin.js');
// Ensure the file exists
if (!fs.existsSync('logs.txt')) {
    fs.writeFileSync('logs.txt', ''); // create an empty file
}
// Create a write stream to the file, 'w' = overwrite on startup
const logFile = fs.createWriteStream('logs.txt', { flags: 'w' });

const originalLog = console.log;

console.log = function (...args) {
    // Write to file
    logFile.write(util.format(...args) + '\n');

    // Also output to the console
    originalLog.apply(console, args);
};

async function cleanAllLogs(dir = './sessionLogs') {
    for (const name of fs.readdirSync(dir)) {
        if (name === ".gitkeep") continue;

        fs.rmSync(path.join(dir, name), {
            recursive: true,
            force: true,
        });
    }
}

// Call the function starting at the root 'autocompleters' folder
cleanAllLogs('./sessionLogs')
    .then(() => console.log('Log cleanup complete!'))
    .catch(console.error);

process.on('uncaughtException', async (err) => {
    console.error('Uncaught Exception:', err);
    try {
        await logError(err, null, 'Global Uncaught Exception');
    } catch (e) {
        console.error('Failed to log error to DB:', e);
    }
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    try {
        await logError(reason, null, 'Global Unhandled Rejection');
    } catch (e) {
        console.error('Failed to log error to DB:', e);
    }
});

const { checkAccount } = require('./database/accounts.js');
// legalDisclamer: `\n> **LEGAL DISCLAMER**: ${name} employs the use of human tutors to complete the tasks given to them by customers of ${name}. No LLM (AI) is used throughout this process. No content or material from the homework platform is used for anything other than its permitted purpose. ${name} is in compliance with all regulations and abides by all Terms of Service of this homework platform.`,
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
});

client.on('error', (error) => {
    console.error('Discord Client Error:', error);
});

client.on('warn', (info) => {
    console.warn('Discord Client Warning:', info);
});

client.on('clientReady', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.commands = new Collection();


const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    if (folder === '.DS_Store') continue;
    const commandsPath = path.join(foldersPath, folder);
    const stats = fs.statSync(commandsPath);
    if (!stats.isDirectory()) continue;
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        // Set a new item in the Collection with the key as the command name and the value as the exported module
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

async function sendPersistentEmbeds(client) {
    const dirPath = path.join(__dirname, 'autocompleters');
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // Filter out only the directories
    const folders = entries.filter(entry => entry.isDirectory());

    let startEmbedCollector = require('./generic/startEmbedCollector.js');
    
    // Loop through them
    for (const folder of folders) {
        const folderPath = path.join(dirPath, folder.name);

        // Determine paths and config keys for startEmbed.js
        const childrenPath = path.join(folderPath, 'children');
        let embedTargets =[]; // Array of objects holding the path and the config dictionary key

        if (fs.existsSync(childrenPath) && fs.statSync(childrenPath).isDirectory()) {
            // If 'children' exists, read its subdirectories (maths, reader, science)
            const childEntries = fs.readdirSync(childrenPath, { withFileTypes: true });
            const childFolders = childEntries.filter(entry => entry.isDirectory());
            
            for (const childFolder of childFolders) {
                embedTargets.push({
                    path: path.join(childrenPath, childFolder.name, 'startEmbed.js'),
                    configKey: `${folder.name}_${childFolder.name}` // Creates "sparx_maths", "sparx_reader", etc.
                });
            }
        } else {
            // Standard behavior: root folder startEmbed.js
            embedTargets.push({
                path: path.join(folderPath, 'startEmbed.js'),
                configKey: folder.name // Uses just "languagenut", "seneca", etc.
            });
        }

        console.log(`Successfully loaded files from folder: ${folder.name}`);

        // Loop through however many targets were found for this folder
        for (const target of embedTargets) {
            if (!fs.existsSync(target.path)) {
                console.log(`Cannot find startEmbed.js at ${target.path}`);
                continue; 
            }

            // Fetch the channel using the specific target config key
            const channelID = config.channels[target.configKey];
            if (!channelID) {
                console.log(`Channel for ${target.configKey} is not configured`);
                continue; 
            }

            const channel = await client.channels.fetch(channelID);
            if (!channel) {
                console.log(`${target.configKey} channel not found`);
                continue;
            }

            const startEmbed = require(target.path);

            // Fetch recent messages to check for existing embeds
            const messages = await channel.messages.fetch({ limit: 50 });

            const existingMessage = messages.find(msg =>
                msg.author.id === client.user.id &&
                msg.components?.[0]?.components?.[0]?.components?.[0]?.data?.content === startEmbed.components[0].components[0].data.content
            );
            
            let embedMessage = existingMessage;

            if (!existingMessage) {
                console.log(`Sending persistent embed for ${target.configKey}`);
                
                embedMessage = await channel.send({
                    flags: MessageFlags.IsComponentsV2,
                    components: [startEmbed]
                });
            }

            if (startEmbedCollector) {
                await startEmbedCollector(embedMessage, folder.name);
            } else {
                console.log(`Cannot find collector for ${folder.name}`);
            }
        }
    }
}

async function DeleteVideos() {
    try {
        const files = await fspromise.readdir('videos');
        if (files.length > 1) {
            console.log("Deleting files...");
            for (const file of files) {
                if (file == '.gitkeep') continue;
                const filePath = path.join('videos', file);
                await fspromise.unlink(filePath);
                console.log(`Deleted ${file}`);
            }
            console.log("All files deleted.");
        } else {
            console.log("No files to delete.");
        }
    } catch (err) {
        console.error("Error deleting files:", err);
    }
}

client.once("clientReady", async () => {
    console.log("Bot has connected to discord");
    await sendPersistentEmbeds(client);
    await DeleteVideos();
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    // Prevent crash in DMs
    if (!interaction.guild) {
        return interaction.reply({
            content: 'This command can only be used in a server.',
            flags: MessageFlags.Ephemeral
        });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(ADMIN_ROLE) && !command.public) {
        return interaction.reply({
            content: 'Only admins can run commands',
            flags: MessageFlags.Ephemeral
        });
    }

    if (!command) {
        await interaction.reply(`No command matching ${interaction.commandName} was found.`);
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    await command.execute(interaction, client);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    try {
        if (interaction.customId.endsWith('_settings')) {
            await processSettings(interaction);
            return;
        }

        if (interaction.customId.startsWith('autocompleterModule_')) {
            const interactionSplit = interaction.customId.split('_');
            const action = interactionSplit[2];
            if (action.startsWith('login')) {
                const parent = seperateParentChild(interactionSplit[1]);
                const login = require(`./autocompleters/${parent.parent}/login.js`);
                const getTokenRequest = require(`./autocompleters/${parent.parent}/getTokenRequest.js`);
                const menu = require(`./autocompleters/${parent.parent}/menu.js`);
                let userSessions;
                if (!parent.child) {
                    userSessions = require(`./autocompleters/${parent.parent}/userSessions.js`);
                } else {
                    userSessions = require(`./autocompleters/${parent.parent}/children/${parent.child}/userSessions.js`);
                }
                await processLogin(interaction, parent.parent, login, getTokenRequest, userSessions, menu);
                return;
            }
    
            const part = interaction.customId
                .replace('autocompleterModule_', '') // sparx(science)_login
                .split('_')[0]                      // sparx(science)
                .split('(')[0];                    // sparx

            const modalExecutor = require(`./autocompleters/${part}/modalExecutor.js`);
            await modalExecutor(interaction);
            return;
        }

        if (interaction.customId.startsWith('set_slots')) {
            await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
            await changeSlots(interaction);
            return;
        }

        if (interaction.customId === 'change_apikey') {
            await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
            await handleApiKeyRequest(interaction);
            const { updateSettingEmbed } = require('./generalSettings.js');
            await updateSettingEmbed(interaction);
            return;
        }

        if (interaction.customId === 'handleSettings') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const platform = interaction.fields.getField('platform').values[0];
            const account = await checkAccount(interaction.user.id);
            if (platform === 'general') {
                const { handleSetting } = require('./generalSettings.js');
                await handleSetting(interaction, account);
                return;
            }
            const filePath = getFile(platform, 'settings.js');
            const { handleSetting } = require(filePath);
            const parents = getParent(platform);
            let data;
            if (!parents.child) {
                data = account[`${platform}_settings`];
            } else {
                data = account[`${parents.parent}_${parents.child}_settings`];
            }
            await handleSetting(interaction, data);
            return;
        }

        if (interaction.customId === 'accountManager_service') {
            await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
            await updateAccountInteraction(interaction);
            return;
        }

        if (interaction.customId === 'view_accounts') {
            await viewSavedAccounts(interaction);
            return;
        }

        if (interaction.customId === 'change_master_password') {
            await changeMasterPassword(interaction);
            return;
        }

        if (interaction.customId.startsWith('main_account')) {
            if (interaction.customId.endsWith('configure')) {
                await mainAccountLogin(interaction);
            } else if (interaction.customId.endsWith('remove')) {
                await mainAccountLogin(interaction, true);
            }
            return;
        }

        if (interaction.customId === 'create_master_password') {
            await createAccount(interaction);
            return;
        }

        if (interaction.customId.startsWith('save_account')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await saveAccount(interaction);
            return;
        }

        if (interaction.customId.startsWith('view_saved_accounts')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await executeViewAccounts(interaction);
            return;
        }

    } catch (error) {
        const errorMessage = {
            content: `⚠️ An error occurred: \`${error.message}\``,
            flags: MessageFlags.Ephemeral
        };

        if (interaction.isRepliable()) {
            await interaction.reply(errorMessage);
        } else if (interaction.deferred || interaction.replied) {
            await interaction.followUp(errorMessage);
        }
    }
});

client.on('messageCreate', async (message) => {
    await imageSolverHandler(message);
});

if (require.main === module) {
    client.login(token);
}