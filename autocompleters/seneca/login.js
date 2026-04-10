require('dotenv').config();
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises; 
const path = require('path'); // Added path module

// Enable stealth plugin
chromium.use(StealthPlugin());

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const smartLogin = require('../../utils/smartLogin');
const convertWebmToMp4 = require('../../utils/convertWebmToMp4');
const generateUUID = require('../../utils/generateUUID');

async function login({
  username,
  password,
  type
} = {}) {
  let browser;
  let context;
  let page;
  
  // Get the absolute path based on where the node process was started
  const videosDir = path.join(process.cwd(), 'videos');
  
  await fs.mkdir(videosDir, { recursive: true });

  // Set absolute path for the return object
  const returnObj = { vid_path: path.join(videosDir, `seneca-${generateUUID()}.webm`) };

  try {
    browser = await chromium.launch({ headless: true });
    
    // Initialize Context with Video Recording using the absolute directory
    context = await browser.newContext({
      recordVideo: {
        dir: videosDir, // Native video saving location (now absolute)
        size: { width: 1280, height: 720 }
      }
    });
    
    page = await context.newPage();

    // --- Attach request listener early ---
    const accessKeyPromise = new Promise(resolve => {
      const onRequest = (req) => {
        // Playwright req.headers() matches Puppeteer's req.headers() behavior
        const headers = req.headers();
        if (headers['access-key']) {
          returnObj.authToken = headers['access-key'];
          page.off('request', onRequest); // stop after first match
          resolve();
        }
      };
      page.on('request', onRequest);
    });

    // --- Go to Seneca login ---
    await page.goto('https://app.senecalearning.com/login', { 
      waitUntil: 'networkidle', 
      timeout: 20000 
    });

    // --- Replicate exact Puppeteer button finding logic ---
    const allButtons = await page.$$('button');
    const continueButtons = [];

    // Using evaluate on innerText ensures we ignore invisible DOM elements
    // just like Puppeteer did, so the array indexing [0], [1], [2] is accurate.
    for (const btn of allButtons) {
      const text = await btn.evaluate(el => el.innerText);
      if (text && text.toLowerCase().includes('continue')) {
        continueButtons.push(btn);
      }
    }

    const landedFunction = ({ page }) => page.isClosed();

    if (type === 'Microsoft') {
      const popupPromise = page.waitForEvent('popup');
      
      await continueButtons[1].click();

      const popup = await popupPromise;
      await popup.bringToFront();

      await smartLogin(popup, username, password, 'Microsoft', landedFunction, () => {});

    } else if (type === 'Google') {
      const popupPromise = page.waitForEvent('popup');
      
      await continueButtons[0].click();

      const popup = await popupPromise;
      await popup.bringToFront();

      await smartLogin(popup, username, password, 'Google', landedFunction, () => {});

    } else {
      await continueButtons[2].click();
      
      await page.waitForSelector('#email', { state: 'visible' });
      await page.fill('#email', username);
      await page.fill('#password', password);

      // Replicate exact Puppeteer submission finding logic
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.innerText.trim());
        if (text === 'Log in' || text === 'Send one-time email link') {
          await btn.click();
          break;
        }
      }
    }

    // --- Wait until either access-key is found OR timeout ---
    await Promise.race([
      accessKeyPromise,
      delay(10000) // wait up to 10s for the token
    ]);

  } catch (err) {
    console.error("Seneca login error:", err);
    // Notice we no longer return false or throw here. 
    // It will log the error and move straight to the `finally` block to process the video.
  } finally {
    // --- Handle Video Saving & Cleanup cleanly ---
    let pwVideoPath = null;

    if (page) {
      pwVideoPath = await page.video()?.path().catch(() => null);
    }
    
    // Context MUST be closed for Playwright to finish writing the video file completely
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});

    // Rename and convert the video file
    if (pwVideoPath) {
      try {
        // Check if the original video file actually exists
        await fs.access(pwVideoPath); 
        
        // Rename the file asynchronously
        await fs.rename(pwVideoPath, returnObj.vid_path);
        
        const finalVideoPath = await convertWebmToMp4(returnObj.vid_path);
        
        // Update the return object with the .mp4 path
        returnObj.vid_path = finalVideoPath; 
      } catch (err) {
        // If fs.access fails, it means the file doesn't exist.
        // If fs.rename fails, it logs here.
        console.error('Failed to save or convert video:', err);
      }
    }
  }

  // ALWAYS return the object containing the absolute video path (and the authToken if it succeeded)
  return returnObj;
}

module.exports = login;