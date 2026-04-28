const addApiKeyExhausted = require('./addApiKeyExhausted');
const removeApiKey = require('./removeApiKey');

async function useApiKeys(apikeys, fn, fnArguments) {
    let answer;
    for (const apikey of apikeys) {
        answer = await fn(apikey, ...fnArguments);
        if (answer === 429) {
            await addApiKeyExhausted(apikey);
        }
        else if (answer === 400) {
            await removeApiKey();
        }
        else if (typeof answer !== 'number') {
            break;
        }
    }
    return answer;
}

module.exports = useApiKeys;