const fs = require('fs');
const path = require('path');

/**
 * Searches for a file within a specific platform folder under 'autocompleters'.
 * 
 * @param {string} platform - The name of the platform folder (e.g., 'maths', 'sparx').
 * @param {string} filename - The name of the file (e.g., 'settings.js').
 * @returns {string|null} - The absolute path to the file, or null if not found.
 */
function getFile(platform, filename) {
    // __dirname is the 'utils' folder. 
    // '..' goes up one level to 'Sparx Discord Bot JS - Private', then into 'autocompleters'
    const baseDir = path.join(__dirname, '..', 'autocompleters');

    // Helper function to recursively search directories
    function searchDirectory(currentDir) {
        // Return null if the directory doesn't exist
        if (!fs.existsSync(currentDir)) return null;

        const files = fs.readdirSync(currentDir);

        for (const file of files) {
            const filePath = path.join(currentDir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                // If it's a folder, search inside it recursively
                const result = searchDirectory(filePath);
                if (result) return result; 
            } else if (file === filename) {
                // If the file matches, check if its directory path includes the platform
                const pathParts = currentDir.split(path.sep);
                if (pathParts.includes(platform)) {
                    return filePath;
                }
            }
        }
        
        return null; // Return null if nothing is found in this directory path
    }

    return searchDirectory(baseDir);
}

module.exports = getFile;