const getApiKeys = require('../../../../utils/getApiKeys.js');
const removeDuplicates = require('../../../../utils/removeDuplicates.js');
const addApiKeyExhausted = require('../../../../utils/addApiKeyExhausted.js');
const { GoogleGenAI } = require("@google/genai");

class SparxQuestionParser {
    
    constructor(interaction, apiKeys) {
        this.userId = interaction.user.id;
        this.apiKeys = apiKeys;
    }

    extractText(obj, results = []) {
        if (typeof obj === "object" && obj !== null) {
            if ("text" in obj && typeof obj.text === "string") {
                results.push(obj.text);
            }
            for (const key in obj) {
                this.extractText(obj[key], results);
            }
        } else if (Array.isArray(obj)) {
            obj.forEach(item => this.extractText(item, results));
        }
        return results;
    }

    extractQuestionText(content) {
        if (!content) return '';
        let text = '';
        if (Array.isArray(content)) {
            for (const item of content) text += this.extractQuestionText(item);
            return text;
        }
        if (content.element === 'text') return content.text + ' ';
        if (content.type?.includes('question-text') || content.content) {
            text += this.extractQuestionText(content.content);
        }
        return text;
    }

    // Recursive function to extract answer parts
    extractAnswerParts(content) {
        if (!content) return [];
        let parts = [];
        if (Array.isArray(content)) {
            for (const item of content) parts = parts.concat(this.extractAnswerParts(item));
            return parts;
        }
        if (content.type?.includes('answer-part')) {
            const partText = this.extractQuestionText(content.content).trim();
            parts.push({ id: content.id, text: partText });
        } else if (content.content) {
            parts = parts.concat(this.extractAnswerParts(content.content));
        }
        return parts;
    }

    // Recursive function to extract images
    extractImages(content) {
        if (!content) return [];
        let images = [];
        if (Array.isArray(content)) {
            for (const item of content) images = images.concat(this.extractImages(item));
            return images;
        }
        if (content?.figure?.image) images.push({ url: content.figure.image });
        else if (content.content) images = images.concat(this.extractImages(content.content));
        return images;
    }

    // Extract slot-based answer options
    extractSlotCards(input) {
        const slotMapping = {};
        if (!input.slot_groups || !input.cards) return slotMapping;

        for (const groupKey in input.slot_groups) {
            const group = input.slot_groups[groupKey];
            const slotRefs = group.slot_refs;

            slotRefs.forEach(slotRef => {
                const cardRefs = input.card_groups[groupKey]?.card_refs || [];
                slotMapping[slotRef] = cardRefs.map(ref => ({
                    ref,
                    value: input.cards[ref].content.map(c => c.text).join(' ') || input.cards[ref].content.map(c => c.src).join(' '),
                }));
            });
        }
        return slotMapping;
    }

    // Extract multiple-choice options
    extractChoices(input) {
        if (!input.choices) return {};
        const choices = {};
        for (const ref in input.choices) {
            choices[ref] = input.choices[ref].content.map(c => c.text).join(' ');
            if (!choices[ref]) {
                choices[ref] = input.choices[ref].content.map(c => c.src).join(' ');
            }
        }
        return choices;
    }

    // Extract choice groups
    extractChoiceGroups(input) {
        if (!input.choice_groups) return [];
        const groups = [];
        for (const key in input.choice_groups) {
            const g = input.choice_groups[key];
            groups.push({
                id: key,
                minChoices: g.min_choices,
                maxChoices: g.max_choices,
                shuffle: g.shuffle,
                choiceRefs: g.choice_refs
            });
        }
        return groups;
    }

    // Recursive function to extract number fields from layout
    // Extract number fields with their preceding text
    extractNumberFieldsWithLabels(content, number_fields) {
        if (!content) return [];
        let fields = [];

        if (Array.isArray(content)) {
            for (let i = 0; i < content.length; i++) {
                const item = content[i];

                // If it's a number-field, capture the nearest text before it
                if (item.element === 'number-field' && item.ref) {
                    let label = null;

                    // Look back for the nearest text element
                    if (i > 0 && content[i - 1].element === 'text') {
                        label = content[i - 1].text;
                    }

                    fields.push({ ref: item.ref, label, properties: number_fields[item.ref] });
                }

                // Recurse if this item has nested content
                if (item.content) {
                    fields = fields.concat(this.extractNumberFieldsWithLabels(item.content, number_fields));
                }
            }
            return fields;
        }

        // Recurse single object
        if (content.content) {
            fields = fields.concat(this.extractNumberFieldsWithLabels(content.content, number_fields));
        }

        return fields;
    }

    // Extract text fields
    extractTextFields(input) {
        return input.text_fields ? Object.keys(input.text_fields) : [];
    }

    // Main parser function
    parseQuestion(json) {
        const layoutContent = json.layout.content;

        const questionText = this.extractText(layoutContent);
        const answerParts = this.extractAnswerParts(layoutContent);
        const images = this.extractImages(layoutContent);

        const slotCards = this.extractSlotCards(json.input);
        const choices = this.extractChoices(json.input);
        const choiceGroups = this.extractChoiceGroups(json.input);
        const numberFields = this.extractNumberFieldsWithLabels(json.layout.content, json.input.number_fields);
        const textFields = this.extractTextFields(json.input);

        return {
            questionText,
            answerParts,
            images,
            slotCards,
            choices,
            choiceGroups,
            numberFields,
            textFields
        };
    }

    getQuestionObject(aiAnswered, activityIndex, questionIndex) {
        const UserSessions = require('./userSessions.js');
        const userSession = UserSessions.get(this.userId);

        const components = [];
        for (const [key, value] of Object.entries(aiAnswered)) {
            components.push({
                'key': key,
                'value': value
            });
        }

        const answerObject = {
            "activityIndex": activityIndex,
            "action": {
                "oneofKind": "question",
                "question": {
                    "questionIndex": questionIndex,
                    "actionType": 1,
                    "answer": {
                        "components": components,
                        "hash": ""
                    }
                }
            },
            "timestamp": userSession.sparxMathsExecuter.getTimestamp(true)
        };

        // console.log(answerObject.action.question.answer.components);
        return answerObject;
    }

    async parseBookworkData(data, bookmarks) {
        const parsedBookwork = [];
        if (!data || !Array.isArray(data.options) || data.options.length === 0) {
            return null;
        }
        for (const option of data.options) {
            const comp = option.wacedAnswer?.components;
            if (comp && option.filledAnswerTemplate) {
                parsedBookwork.push({ filledAnswerTemplate: option.filledAnswerTemplate, components: comp });
            }
        }

        const bookworkCode = data.bookworkCode;
        for (const bookmark of parsedBookwork) {

            const bookmarkParsed = bookmark.filledAnswerTemplate
                .replace(/<[^>]*>/g, ' ') // replace tags with spaces
                .replace(/\s+/g, ' ')     // normalize multiple spaces
                .trim();

            if (bookmarks?.[bookworkCode] && bookmarkParsed === bookmarks[bookworkCode]) {
                return { filledAnswerTemplate: bookmark.filledAnswerTemplate, components: bookmark.components };
            }
        }
        
        /*
        if (parsedBookwork.length > 0) {
            const randomIndex = Math.floor(Math.random() * parsedBookwork.length);
            const randomBookmark = parsedBookwork[randomIndex];
            console.log(`Selected random answer: ${randomBookmark.filledAnswerTemplate}`);
            return { answerMarkup: randomBookmark.filledAnswerTemplate, components: { key: randomBookmark.key, value: randomBookmark.value}};
        }
        */
        
        return null;
    }

    parseBookwork(activityIndex, parsedBookworkAnswer) {
        const UserSessions = require('./userSessions.js');
        const userSession = UserSessions.get(this.userId);
        if (!Array.isArray(parsedBookworkAnswer.components)) {
            parsedBookworkAnswer.components = [parsedBookworkAnswer.components];
        }
        const answer = {
            "activityIndex": activityIndex,
            "action": {
                "oneofKind": "wac",
                "wac": {
                    "actionType": 1,
                    "extraData": {
                        "answerMarkup": parsedBookworkAnswer.filledAnswerTemplate
                    },
                    "answer": {
                        "components": parsedBookworkAnswer.components,
                        "hash": ""
                    }
                }
            },
            "timestamp": userSession.sparxMathsExecuter.getTimestamp()
        };

        return answer;

        // console.log(parsedBookwork);
    }

    async parse(data, activityIndex, questionIndex, model, incorrect_answers) {
        const parsedData = this.parseQuestion(data);

        const { geminiAnswer, geminiAnswers } = require('../../../../gemini/sparx_maths/main');
        const apikeys = removeDuplicates([...this.apiKeys, ...(await getApiKeys())]);
        let aiAnswered;
        for (const apikey of apikeys) {
            let gemAns = geminiAnswer;
            const newClass = new geminiAnswers();
            newClass.ai = new GoogleGenAI({ apiKey: apikey });
            gemAns = newClass;
            aiAnswered = await gemAns.answerQuestion(parsedData, model, incorrect_answers);

            if (aiAnswered === 429) await addApiKeyExhausted(apikey);
            if (typeof aiAnswered !== 'number') break;
        }
        return this.getQuestionObject(aiAnswered, activityIndex, questionIndex);
    }
}

module.exports = SparxQuestionParser;