require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { updateDB, appendToDB } = require('./general');

const supabaseUrl = process.env.SUPABASEURL;
const supabaseKey = process.env.SUPABASEKEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function addToDb(id, correct_answer, incorrect_answers=[]) {
    const { data } = await supabase
        .from('sparx_reader')
        .select('*')
        .eq('id', id)
        .maybeSingle()
        .throwOnError();
        
    if (!data) {
        await supabase
        .from('sparx_reader')
        .insert([
            { id: id, correct_answer: correct_answer, incorrect_answers: incorrect_answers },
        ])
        .throwOnError();
    } else {
        let incorrectAnswers = data.incorrect_answers || [];

        for (const answer of incorrect_answers) {
            if (!incorrectAnswers.includes(answer)) {
                incorrectAnswers.push(answer);
            }
        }

        await supabase
        .from('sparx_reader')
        .update({ correct_answer: correct_answer, incorrect_answers: incorrectAnswers })
        .eq('id', id)
        .throwOnError();
    }
}

async function checkAnswer(id, questionObj) {
    const { data } = await supabase
        .from('sparx_reader')
        .select('*')
        .eq('id', id)
        .maybeSingle()
        .throwOnError();

    if (questionObj?.questionText && questionObj?.questionOptions && (!data?.text || !data?.options)) {
        if (data) {
            await updateDB('sparx_reader', {text: questionObj.questionText, options: questionObj.questionOptions}, 'id', id);
        } else {
            await appendToDB('sparx_reader', {id, text: questionObj.questionText, options: questionObj.questionOptions});
        }
    }
    
    if (data) {
        if (data.correct_answer) {
            return data.correct_answer;
        } else if (data.incorrect_answers.length) {
            return data.incorrect_answers;
        }
    } 
        
    return null;
}

module.exports = { addToDb, checkAnswer};