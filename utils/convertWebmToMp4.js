const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function convertWebmToMp4(vid_path) {
  const mp4Path = vid_path.replace('.webm', '.mp4');
  await execAsync(`ffmpeg -i "${vid_path}" -c:v libx264 -preset ultrafast -movflags faststart "${mp4Path}"`);
  if (fs.existsSync(vid_path)) fs.unlinkSync(vid_path);
  return mp4Path;
}

module.exports = convertWebmToMp4;