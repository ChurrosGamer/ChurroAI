const fs = require('fs');
const path = require('path');

/**
 * Searches for a platform folder under 'autocompleters' and determines its hierarchy.
 * 
 * @param {string} platform - The name of the platform folder to find.
 * @returns {{parent: string, child: string|null}|null} - An object with parent/child relationships, or null if not found.
 */
function getParent(platform) {
    // __dirname is the 'utils' folder. 
    // '..' goes up one level to 'Sparx Discord Bot JS - Private', then into 'autocompleters'
    const baseDir = path.join(__dirname, '..', 'autocompleters');

    // Helper function to recursively search directories
    function searchDirectory(currentDir) {
        // Return null if the directory doesn't exist
        if (!fs.existsSync(currentDir)) return null;

        const items = fs.readdirSync(currentDir);

        for (const item of items) {
            const itemPath = path.join(currentDir, item);
            const stat = fs.statSync(itemPath);

            // We only care about directories for this logic
            if (stat.isDirectory()) {
                
                // If the folder matches the platform we are looking for
                if (item === platform) {
                    
                    // Get the path relative to the baseDir ('autocompleters')
                    // For example, it might return "sparx/children/science"
                    const relativePath = path.relative(baseDir, itemPath);
                    
                    // Split the path into parts: ['sparx', 'children', 'science']
                    const parts = relativePath.split(path.sep);

                    if (parts.length === 1) {
                        // It is directly inside 'autocompleters' (e.g. ['sparx'])
                        return { 
                            parent: platform, 
                            child: null 
                        };
                    } else {
                        // It is nested. The ultimate parent is the very first folder in the path
                        const topLevelParent = parts[0]; // This will be 'sparx'
                        
                        return { 
                            parent: topLevelParent, 
                            child: platform 
                        };
                    }
                }

                // If this folder wasn't the platform, search inside it recursively
                const result = searchDirectory(itemPath);
                if (result) return result; 
            }
        }
        
        return null; // Return null if nothing is found in this path
    }

    return searchDirectory(baseDir);
}

module.exports = getParent;