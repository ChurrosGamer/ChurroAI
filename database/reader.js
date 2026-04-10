require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

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


async function checkAnswer(id) {
    const { data } = await supabase
        .from('sparx_reader')
        .select('*')
        .eq('id', id)
        .maybeSingle()
        .throwOnError();

    if (data) {
        if (data.correct_answer) {
            return data.correct_answer;
        } else {
            return data.incorrect_answers;
        }
    } else {
        return null;
    }
}

module.exports = { addToDb, checkAnswer};