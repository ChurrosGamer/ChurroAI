const fs = require('fs').promises;
const path = require('path');

async function getApiKeys() {
  const keysPath = path.join(__dirname, '..', 'apikeys.txt');
  const exhaustedPath = path.join(__dirname, '..', 'apikeys_exhausted.txt');

  // 1. Read all keys
  const keysText = await fs.readFile(keysPath, 'utf8');
  const allKeys = keysText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  // If there are no keys in the main file, just return an empty array
  if (allKeys.length === 0) {
    return [];
  }

  // 2. Attempt to read exhausted keys
  let exhaustedSet = new Set();
  try {
    const exhaustedText = await fs.readFile(exhaustedPath, 'utf8');
    const exhaustedArray = exhaustedText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    
    exhaustedSet = new Set(exhaustedArray); // Using a Set makes filtering much faster
  } catch (err) {
    // If the file doesn't exist yet, we just ignore the error 
    // and proceed with an empty exhaustedSet.
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  // 3. Filter out the exhausted keys
  const availableKeys = allKeys.filter(key => !exhaustedSet.has(key));

  // 4. Check if we ran out of keys
  if (availableKeys.length === 0) {
    // Wipe the exhausted file by writing an empty string to it
    await fs.writeFile(exhaustedPath, '', 'utf8');
    
    // Return the full original list of keys
    return allKeys;
  }

  // 5. Return the available (unexhausted) keys
  return availableKeys;
}

module.exports = getApiKeys;