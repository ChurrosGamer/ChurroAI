const fs = require('fs');
const path = require('path');

/**
 * Searches for all instances of a specific file across all folders under 'autocompleters'.
 * Returns an object where the key is the immediate parent folder name, and the value is the file path.
 * 
 * @param {string} filename - The name of the file to find.
 * @returns {Object} - An object mapping folder names to absolute file paths.
 */
function getAllFiles(filename) {
    const baseDir = path.join(__dirname, '..', 'autocompleters');
    const results = {};

    // Helper function to recursively search directories
    function searchDirectory(currentDir) {
        // Return if the directory doesn't exist
        if (!fs.existsSync(currentDir)) return;

        const files = fs.readdirSync(currentDir);

        for (const file of files) {
            const filePath = path.join(currentDir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                // If it's a folder, search inside it recursively
                searchDirectory(filePath);
            } else if (file === filename) {
                // If the file matches, get the name of the folder it sits in
                // path.basename gets just the final folder name (e.g., 'maths', 'reader')
                const folderName = path.basename(currentDir);
                
                // Add it to our results object
                results[folderName] = require(filePath);
            }
        }
    }

    // Start the search
    searchDirectory(baseDir);

    return results;
}

module.exports = getAllFiles;