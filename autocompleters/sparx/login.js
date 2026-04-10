const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const smartLogin = require('../../utils/smartLogin');
const getTokenRequest = require('./getTokenRequest');
const generateUUID = require('../../utils/generateUUID');

chromium.use(StealthPlugin());
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const convertWebmToMp4 = require('../../utils/convertWebmToMp4');

// Helper: Check if file/directory exists asynchronously
async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// --- Fast safe click ---
async function safeClick(page, selector, maxAttempts = 2) {
  const locator = page.locator(selector).first();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await locator.click({ force: true, timeout: 2000 });
      return true;
    } catch {
      const clicked = await page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          el.click();
          return true;
        }
        return false;
      }, selector);

      if (clicked) return true;
    }

    if (attempt < maxAttempts - 1) await delay(100);
  }
  throw new Error(`Failed to click ${selector}`);
}

async function clickButtonWithText(page, text, timeout = 10000) {
  const start = Date.now();
  const btn = page.locator(`button:has-text("${text}")`).first();

  while (Date.now() - start < timeout) {
    try {
      await btn.click({ force: true, timeout: 1000 });
      return;
    } catch {
      const clicked = await page.evaluate((btnText) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const targetBtn = buttons.find(b => b.textContent.trim().includes(btnText));
        if (targetBtn && targetBtn.offsetParent !== null) {
          targetBtn.click();
          return true;
        }
        return false;
      }, text);

      if (clicked) return;
    }
    await delay(100);
  }

  throw new Error(`Button with text "${text}" not found`);
}

async function login({ school, username, password, type } = {}) {
  const addLog = () => {};

  // Set up absolute videos directory
  const videosDir = path.join(process.cwd(), 'videos');
  if (!(await fileExists(videosDir))) {
    await fs.mkdir(videosDir, { recursive: true });
  }

  const returnObj = { vid_path: path.join(videosDir, `sparx-${generateUUID()}.webm`) };

  let browser;
  let context;
  let page;

  let schoolStatus = false;
  let loginTypeStatus = false;
  let emailTypeStatus = false;
  let passTypeStatus = false;
  let smartLoginVar = { filledEmail: false, filledPassword: false };

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--ignore-certificate-errors',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--ignore-certificate-errors-spki-list'
      ]
    });

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.71',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0'
    ];
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    context = await browser.newContext({
      userAgent: randomUserAgent,
      ignoreHTTPSErrors: true,
      recordVideo: {
        dir: videosDir,
        size: { width: 1280, height: 720 }
      }
    });

    page = await context.newPage();
    addLog('Browser launched and new page created.');
    addLog(`Playwright Video recording started -> will be moved to ${returnObj.vid_path}`);

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    });

    await page.goto(`https://selectschool.sparx-learning.com/?app=sparx_learning`, {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });
    addLog('Navigated to select school page.');

    await page.evaluate(() => {
      const el = document.getElementById('cookiescript_injected_wrapper');
      if (el) el.remove();
    }).catch(() => {});

    const schoolInputSel = '._Input_1573n_4';
    await page.locator(schoolInputSel).first().waitFor({ state: 'visible', timeout: 5000 });

    const schoolInputValue = await page.locator(schoolInputSel).first().inputValue();
    if (!schoolInputValue || schoolInputValue.trim() === '') {
      await page.locator(schoolInputSel).first().fill(school);
      addLog('Filled school name.');
    } else {
      addLog('School name already filled, skipping.');
    }

    const schoolResultSel = '._SchoolResult_1h7n6_1';
    await page.locator(schoolResultSel).first().waitFor({ state: 'visible', timeout: 5000 });
    await safeClick(page, schoolResultSel);
    addLog('Selected school result.');

    schoolStatus = true;

    await clickButtonWithText(page, 'Continue', 3000);
    addLog('Clicked Continue.');

    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 3000 });
    } catch {}
    await delay(1500);
    addLog('Waited for post-continue navigation.');

    await page.evaluate(() => {
      const el = document.getElementById('cookiescript_injected_wrapper');
      if (el) el.remove();
    }).catch(() => {});

    if (type.toLowerCase() !== 'normal') {
      await safeClick(page, '.sm-button.sso-login-button');
      addLog('Clicked SSO login button.');
      loginTypeStatus = true;

      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      } catch {}
      await delay(1500);
      addLog('Waited for SSO redirect.');

      const landedFunction = ({ url }) =>
        ['science', 'reader', 'maths', 'app']
          .some(sub => url.includes(sub + '.sparx-learning.com'));

      smartLoginVar = await smartLogin(page, username, password, type, landedFunction, addLog);
      addLog(`smartLogin finished: emailFilled=${smartLoginVar.filledEmail}, passFilled=${smartLoginVar.filledPassword}`);
    } else {
      const inputs = page.locator('.sm-input');
      const count = await inputs.count();
      if (count >= 2) {
        const emailInput = inputs.nth(0);
        const passInput = inputs.nth(1);

        const emailValue = await emailInput.inputValue();
        if (!emailValue || emailValue.trim() === '') {
          await emailInput.fill(username);
          emailTypeStatus = true;
          addLog('Filled email in normal login.');
        }

        const passValue = await passInput.inputValue();
        if (!passValue || passValue.trim() === '') {
          await passInput.fill(password);
          passTypeStatus = true;
          addLog('Filled password in normal login.');
        }
      } else {
        throw new Error('Normal login inputs not found.');
      }

      emailTypeStatus = true;
      passTypeStatus = true;

      await safeClick(page, '.sm-button.login-button');
      addLog('Clicked login button (normal login).');

      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      } catch {}
      addLog('Waited for post-login navigation (normal login).');
    }

    await delay(1500);

    const cookies = await context.cookies();
    const live = cookies.find(c => c.name === 'live_ssoprovider_session');
    const spx = cookies.find(c => c.name === 'spxlrn_session');

    const cookieString = `live_ssoprovider_session=${live?.value || ''}; spxlrn_session=${spx?.value || ''}`;
    addLog(`Cookie check (final): live=${!!live}, spxlrn=${!!spx}`);
    addLog(cookieString);

    if (cookieString.length <= 42) {
      throw new Error("Login failed - no valid cookies found");
    }

    const token = await getTokenRequest(cookieString);
    returnObj.authToken = token;

    emailTypeStatus = smartLoginVar.filledEmail || emailTypeStatus;
    passTypeStatus = smartLoginVar.filledPassword || passTypeStatus;

    addLog('Login successful, cookies validated.');

  } catch (err) {
    addLog(`Login failed: ${err.message}`);

    returnObj.status = 'error';
    returnObj.schoolStatus = schoolStatus;
    returnObj.loginTypeStatus = loginTypeStatus;
    returnObj.emailTypeStatus = smartLoginVar.filledEmail || emailTypeStatus;
    returnObj.passTypeStatus = smartLoginVar.filledPassword || passTypeStatus;

  } finally {
    let pwVideoPath = null;

    if (page) {
      pwVideoPath = await page.video()?.path().catch(() => null);
    }

    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});

    if (pwVideoPath && (await fileExists(pwVideoPath))) {
      try {
        await fs.rename(pwVideoPath, returnObj.vid_path);
        const finalVideoPath = await convertWebmToMp4(returnObj.vid_path);
        addLog(`Video successfully saved at: ${finalVideoPath}`);
        returnObj.vid_path = finalVideoPath;
      } catch (err) {
        console.error('Failed to save or convert video:', err);
      }
    }
  }

  return returnObj;
}

module.exports = login;