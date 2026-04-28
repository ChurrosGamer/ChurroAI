const getApiKeys = require('../../../../utils/getApiKeys.js');
const removeDuplicates = require('../../../../utils/removeDuplicates.js');
const useApiKeys = require('../../../../utils/useApiKeys.js');

class SparxParser {

    constructor(apiKeys) {
        this.apiKeys = apiKeys;
    }

    extractText(obj, results = []) {
        if (typeof obj === "object" && obj !== null) {
            if ("text" in obj && typeof obj.text === "string") {
                results.push(obj.text);
            }
            if (obj.element === 'text-field') {
                results.push(`> [INPUT HERE REF:${obj.ref}]`);
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
    extractChoiceGroups(input, layoutContent) {
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

        const allRefs = groups.map(group => group.choiceRefs);

        function extractRefPos(obj, results = []) {
            if (typeof obj === "object" && obj !== null) {
                // Check if obj has a 'ref' property
                if (obj.ref) {
                    for (const [index, refArray] of allRefs.entries()) {
                        // refArray might be an array, check if it includes obj.ref
                        if (Array.isArray(refArray) && refArray.includes(obj.ref)) {
                            results.push(index);
                            break;
                        }
                    }
                }

                // Recurse for all properties
                for (const key in obj) {
                    extractRefPos(obj[key], results);
                }
            }
            return results;
        }

        const results = extractRefPos(layoutContent);
        // Remove duplicates while keeping first occurrence
        let uniqueResults = [...new Set(results)];

        const groupedByOrder = uniqueResults.map(index => groups[index]);

        return groupedByOrder;
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

    getTextRefs(elements) {
        let refs = [];

        function traverse(element) {
            if (!element) return;

            // If it's an array, traverse each item
            if (Array.isArray(element)) {
                element.forEach(traverse);
                return;
            }

            // Check for answer-part with text-field
            if (element.type && element.type.includes("answer-part")) {
                if (element.content) {
                    element.content.forEach(c => {
                        if (c.element === "text-field" && c.ref) {
                            refs.push({ ref: c.ref, text_area: c.text_area ?? false });
                        }
                    });
                }
            }

            // Recurse into nested content
            if (element.content) {
                traverse(element.content);
            }
        }

        traverse(elements);
        return refs;
    }

    parseQuestion(json) {
        const layoutContent = json.layout.content;

        const questionText = this.extractText(layoutContent);
        const answerParts = this.extractAnswerParts(layoutContent);
        const images = this.extractImages(layoutContent);

        const slotCards = this.extractSlotCards(json.input);
        const choices = this.extractChoices(json.input);
        const choiceGroups = this.extractChoiceGroups(json.input, layoutContent);
        const numberFields = this.extractNumberFieldsWithLabels(json.layout.content, json.input.number_fields);
        const textFields = this.getTextRefs(layoutContent);

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

    getQuestionObject(aiAnswered, activityName, token) {
        const components = Object.entries(aiAnswered).reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});

        const answerObject = {
            "name": activityName,
            "action": {
                "oneofKind": "answer",
                "answer": {
                    "components": components,
                    "autoProgressStep": false
                }
            },
            "token": token
        };

        // console.log(answerObject.action.question.answer.components);
        return answerObject;
    }

    async parse(data, model, activityName, token, supportMaterial, incorrect_answers) {
        const parsedData = this.parseQuestion(data);

        const { geminiAnswer } = require('../../../../gemini/sparx_maths/main');
        const apikeys = removeDuplicates([...this.apiKeys, ...(await getApiKeys())]);
        const aiAnswered = await useApiKeys(apikeys, geminiAnswer.answerQuestion, [parsedData, model, incorrect_answers, "science", supportMaterial]);

        const answerObject = this.getQuestionObject(aiAnswered, activityName, token);

        return answerObject;
    }
}

module.exports = SparxParser;