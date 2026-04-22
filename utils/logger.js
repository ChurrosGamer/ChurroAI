const { MessageFlags, AttachmentBuilder, ContainerBuilder, FileBuilder, TextDisplayBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const util = require('util');
const FormData = require('form-data');
const WEBHOOK_URL = process.env.LOGS_WEBHOOK_URL;
const { colours } = require('../config.json');

class logger {
    constructor(userId, platform) {
        this.filepath = `sessionLogs/${platform}_${userId}.txt`;
        this.init();
    }

    /**
     * Generates a timestamp string. 
     * Uses ISO format (YYYY-MM-DD HH:MM:SS) which is easy to read and sort.
     */
    getCurrentTime() {
        return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    }

    logToFile(...args) {
        // Format the incoming arguments (objects, strings, etc.)
        const message = util.format(...args);
        
        // Create the line with the timestamp
        const logLine = `[${this.getCurrentTime()}] ${message}`;

        // Ensure logFile exists and is writable
        if (this.logFile && this.logFile.writable) {
            this.logFile.write(logLine + '\n');
        }

        // Optional: Also print to console so you can see it live while debugging
        // console.log(logLine);
    }

    async send(user) {
        await this.sendToWebhook();
        const filePath = path.resolve(this.filepath);
        const attachment = new AttachmentBuilder(filePath, { name: 'logs.txt' });
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Session Logs!'))
            .addFileComponents(new FileBuilder().setURL('attachment://logs.txt'));

        await user.send({ files: [attachment], components: [container], flags: MessageFlags.IsComponentsV2 });

        fs.unlinkSync(filePath);

    }

    async sendToWebhook() {
        const filePath = path.resolve(this.filepath);
        
        // 1. Close the Write Stream to ensure all data is flushed to disk
        if (this.logFile) {
            await new Promise((resolve) => {
                this.logFile.end(() => {
                    this.logFile = null; // Mark as closed
                    resolve();
                });
            });
        }

        const form = new FormData();

        const embed = {
            title: 'Session Logs',
            description: `Logs uploaded at **${this.getCurrentTime()}**`,
            color: colours.onyx,
            fields: [
                { name: 'File Path', value: this.filepath ?? 'null' },
            ]
        };

        // 2. Check if file exists AND has content
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 0) {
                form.append('file', fs.createReadStream(filePath), { filename: 'log.txt' });
            } else {
                embed.description += "\n\n*Log file was empty.*";
            }
        }

        // 3. Append the JSON payload
        form.append('payload_json', JSON.stringify({ embeds: [embed] }));

        if (!WEBHOOK_URL) return;
        try {
            await axios.post(WEBHOOK_URL, form, { 
                headers: form.getHeaders(),
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            });
        } catch (error) {
            console.error("Webhook failed:", error.response ? error.response.data : error.message);
        }
        
        // Optional: Re-init if you plan to keep logging after sending
        // this.init(); 
    }

    init() {
        // Ensure directory exists if needed, otherwise just create file
        // Validates that the file path is writeable
        try {
            if (!fs.existsSync(this.filepath)) {
                fs.writeFileSync(this.filepath, '');
            }
            this.logFile = fs.createWriteStream(this.filepath, { flags: 'a' }); 
        } catch (err) {
            console.error("Failed to initialize logger:", err);
        }
    }
}

module.exports = logger;