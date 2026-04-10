const fs = require('fs');
const path = require('path');

function getAllAutocompletersNames() {
    // Navigate up one folder from 'utils' to get to 'autocompleters'
    const autocompletersPath = path.join(__dirname, '../autocompleters');
    const names = [];

    try {
        // Read all items inside the autocompleters folder
        const items = fs.readdirSync(autocompletersPath, { withFileTypes: true });

        for (const item of items) {
            // We only want to look at directories, ignoring any base files
            if (item.isDirectory()) {
                const dirName = item.name;
                const childrenPath = path.join(autocompletersPath, dirName, 'children');

                // Check if this directory has a 'children' subfolder
                if (fs.existsSync(childrenPath) && fs.statSync(childrenPath).isDirectory()) {
                    // Read the folders inside 'children' (maths, reader, science)
                    const childItems = fs.readdirSync(childrenPath, { withFileTypes: true });
                    
                    for (const child of childItems) {
                        if (child.isDirectory()) {
                            // Combine them: e.g., 'sparx' + '_' + 'maths'
                            names.push(`${dirName}_${child.name}`);
                        }
                    }
                } else {
                    // If no 'children' folder exists, just use the main folder name (e.g., languagenut)
                    names.push(dirName);
                }
            }
        }
    } catch (error) {
        console.error("Error reading autocompleters directory:", error);
    }

    return names;
}

module.exports = getAllAutocompletersNames;