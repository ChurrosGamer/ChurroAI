require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const withRetry = require('../utils/withRetry');

const supabaseUrl = process.env.SUPABASEURL;
const supabaseKey = process.env.SUPABASEKEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getSparxQuestion(canonicalizedContent) {
    // Pass the string exactly as it is
    const { data, error } = await supabase.rpc('get_sparx_answer', {
        search_content: canonicalizedContent 
    });

    if (error) {
        console.error("RPC Error:", error);
        return null;
    }
    
    return data;
}

async function getFromDB(table_name, matchColumn, matchData, returnProperty) {
    const { data } = await supabase
        .from(table_name)
        .select('*')
        .eq(matchColumn, matchData)
        .maybeSingle()
        .throwOnError();

    if (returnProperty && data) {
        return data[returnProperty];
    }
    return data;
}

async function appendToDB(table_name, insertData) {
    await supabase
        .from(table_name)
        .insert([
            insertData,
        ])
        .throwOnError();
}

async function updateDB(table_name, updateData, matchColumn, matchData) {
    await supabase
        .from(table_name)
        .update(updateData)
        .eq(matchColumn, matchData)
        .throwOnError();
}

async function deleteEntryDB(table_name, matchColumn, matchData) {
    await supabase
        .from(table_name)
        .delete()
        .eq(matchColumn, matchData)
        .throwOnError();    
}

module.exports = { 
    appendToDB: withRetry(appendToDB), 
    updateDB: withRetry(updateDB), 
    getFromDB: withRetry(getFromDB), 
    deleteEntryDB: withRetry(deleteEntryDB),
    getSparxQuestion: withRetry(getSparxQuestion)
};