const { MessageFlags, AttachmentBuilder, FileBuilder, ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const loginWrapper = require('../utils/loginWrapper.js');
const fs = require('fs');
const { colours } = require('../config.json');

function getIfExists(fields, id) {
    return fields.fields.has(id)
        ? fields.getTextInputValue(id)
        : undefined;
}

async function processLogin(interaction, platform, login, getTokenRequest, userSessions, menu) {
    await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
    let loginDetails = { app: platform };

    if (interaction.customId.endsWith('_login')) {
        const school = getIfExists(interaction.fields, 'school');
        const username = interaction.fields.getTextInputValue('username');
        const password = interaction.fields.getTextInputValue('password');

        const type = interaction.fields.fields.has('type')
            ? interaction.fields.getField('type')?.values?.[0]
            : undefined;

        loginDetails = {
            app: platform,
            username,
            password,
            ...(school && { school }),
            ...(type && { type }),
        };

    } else if (interaction.customId.endsWith('_loginSaved')) {
        const { school, username, password, type } = interaction.loginDetails;

        loginDetails = {
            app: platform,
            username,
            password,
            ...(school && { school }),
            ...(type && { type }),
        };

    } else if (interaction.customId.endsWith('_loginCookie')) {
        const cookie = interaction.fields.getTextInputValue('cookie');

        loginDetails = {
            app: platform,
            cookie
        };
    }

    const Loadingcontainer = new ContainerBuilder()
        .setAccentColor(colours.blue)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### Logging In... :hourglass:\nAttempting to log in to your account...`)
        );

    await interaction.editReply({
        components: [Loadingcontainer],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });

    let authToken;
    let sessionResults = {};
    if (!loginDetails.cookie) {
        sessionResults = await loginWrapper(() =>
            login(loginDetails)
        );
        authToken = sessionResults.authToken;
    } else {
        authToken = await getTokenRequest(loginDetails.cookie);
    }

    if (!authToken || authToken.length < 50) {let attachment;

        if (sessionResults.vid_path) {
            attachment = new AttachmentBuilder(
                sessionResults.vid_path,
                { name: 'login_failed.mp4' }
            );
        }

        const container = new ContainerBuilder()
            .setAccentColor(colours.light_red)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ❌ Login Failed\nUnable to Login. Please check your login details and try again.`));

        if (attachment) {
            container.addFileComponents(new FileBuilder().setURL('attachment://login_failed.mp4'));
        }

        // Safely build the options for editReply
        const replyOptions = {
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            components: [container],
        };

        if (attachment) {
            replyOptions.files = [attachment];
        }

        await interaction.editReply(replyOptions);
        if (sessionResults.vid_path) {
            fs.unlinkSync(sessionResults.vid_path);
        }
        return;
    }

    if (sessionResults.vid_path) {
        fs.unlinkSync(sessionResults.vid_path);
    }

    await userSessions.createNewSession(interaction, loginDetails, authToken);

    const loginSuccessContainer = new ContainerBuilder()
        .setAccentColor(colours.light_green)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ✅ Login Successful\nSuccessfully logged into your account. Loading...`)
        );

    await interaction.editReply({
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [loginSuccessContainer]
    });

    const userSession = userSessions.get(interaction.user.id);

    await menu(userSession);
}

module.exports = processLogin;