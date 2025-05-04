// CommonJS syntax for imports
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs-extra");
const path = require("path");
const { WebcastPushConnection } = require("tiktok-live-connector");
const { USERNAME } = require("./constant");

// Apply stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Load accounts configuration
let accountsConfig;
try {
  accountsConfig = JSON.parse(fs.readFileSync("accounts.json", "utf8"));
  console.log(
    `Loaded ${accountsConfig.accounts.length} accounts from accounts.json`
  );
} catch (error) {
  console.error("Error loading accounts.json:", error.message);
  console.error(
    "Please make sure accounts.json exists and is properly formatted"
  );
  process.exit(1);
}

// Configuration
const CONFIG = {
  targetUsername: USERNAME, // The TikTok account to buff from constant.js
  accountsFolder: "./accounts", // Folder containing account cookies
  accounts: accountsConfig.accounts || [], // Account data from JSON

  comments: [
    "Love this content! 🔥",
    "Amazing stream! ❤️",
    "Keep up the great work! 👏",
    "You're awesome! 🌟",
    "This is so entertaining! 😍",
    "Wow, great job! 👍",
    "I look forward to your streams! ✨",
    "Such talent! 💯",
    "You make my day better! 🙌",
    "This is exactly what I needed today! 💕",
  ],
  commentInterval: {
    min: 55000, // Minimum time between comments (55 seconds)
    max: 120000, // Maximum time between comments (2 minutes)
  },
  likeInterval: {
    min: 25000, // Minimum time between likes (25 seconds)
    max: 60000, // Maximum time between likes (1 minute)
  },
  viewDelay: {
    min: 2000, // Minimum delay before interacting after joining (2 seconds)
    max: 15000, // Maximum delay before interacting after joining (15 seconds)
  },
};

// Utility function to get random time within range
function getRandomTime(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Utility function to add random delay
async function randomDelay(min = 500, max = 2000) {
  const delay = getRandomTime(min, max);
  await new Promise((resolve) => setTimeout(resolve, delay));
  return delay;
}

// Function to generate human-like mouse movements
async function humanMouseMovement(page, targetSelector) {
  try {
    // Get the bounding box of the target element
    const elementHandle = await page.$(targetSelector);
    if (!elementHandle) return false;

    const box = await elementHandle.boundingBox();
    if (!box) return false;

    // Calculate a random point within the element
    const x = box.x + Math.random() * box.width;
    const y = box.y + Math.random() * box.height;

    // Generate 3-5 random waypoints
    const waypoints = Math.floor(Math.random() * 3) + 3;
    let currentX = Math.random() * page.viewport().width;
    let currentY = Math.random() * page.viewport().height;

    for (let i = 0; i < waypoints; i++) {
      // Calculate a point that moves toward the target
      const stepX =
        currentX +
        ((x - currentX) * (i + 1)) / waypoints +
        (Math.random() - 0.5) * 50;
      const stepY =
        currentY +
        ((y - currentY) * (i + 1)) / waypoints +
        (Math.random() - 0.5) * 50;

      await page.mouse.move(stepX, stepY, { steps: 10 });
      await randomDelay(50, 150);
    }

    // Final move to the target
    await page.mouse.move(x, y, { steps: 10 });
    return true;
  } catch (error) {
    return false;
  }
}

// Ensure accounts folder exists
fs.ensureDirSync(CONFIG.accountsFolder);

// Class to manage a TikTok browser session
class TikTokBrowser {
  constructor(accountData, index) {
    this.accountData = accountData;
    this.index = index;
    this.userDataDir = path.join(CONFIG.accountsFolder, `profile_${index}`);
    this.browser = null;
    this.page = null;
    this.loggedIn = false;
    this.loginAttempted = false;

    // Generate a consistent but random fingerprint for this browser instance
    this.userAgent = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36",
    ][index % 4];
  }

  async init() {
    // Create user data directory if it doesn't exist
    fs.ensureDirSync(this.userDataDir);

    console.log(`[Profile ${this.index}] Launching browser...`);

    // Set up browser launch options
    const launchOptions = {
      headless: false, // We need to see the browser for login/verification
      userDataDir: this.userDataDir,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-infobars",
        "--disable-notifications",
        "--disable-automation",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1280,800",
        `--window-position=${this.index * 100},${this.index * 50}`,
      ],
      defaultViewport: {
        width: 1280,
        height: 800,
      },
      ignoreDefaultArgs: ["--enable-automation"],
    };

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // Set a unique user agent for this browser
    await this.page.setUserAgent(this.userAgent);

    // Additional fingerprint evasions
    await this.page.evaluateOnNewDocument(() => {
      // Override the webdriver property
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });

      // Override the plugins length
      Object.defineProperty(navigator, "plugins", {
        get: () => {
          return [1, 2, 3, 4, 5];
        },
      });

      // Override the languages property
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
    });

    await this.page.setDefaultNavigationTimeout(60000);

    // Check if we're logged in
    try {
      await this.page.goto("https://www.tiktok.com/", {
        waitUntil: "networkidle2",
      });

      // Random delay to look more human
      await randomDelay(1000, 3000);

      // Check if the login button exists (looking for multiple possible selectors)
      const loginButton = await this.page.$("button#header-login-button");

      if (loginButton) {
        console.log(
          `[Profile ${
            this.index
          }] Not logged in. Will attempt to login with account: ${
            this.accountData.username || this.accountData.email
          }`
        );
        this.loggedIn = false;

        // Navigate directly to login page immediately instead of waiting
        console.log(
          `[Profile ${this.index}] Navigating to TikTok login page...`
        );
        await this.page.goto(
          "https://www.tiktok.com/login/phone-or-email/email",
          {
            waitUntil: "networkidle2",
          }
        );

        // Try to log in immediately
        await this.attemptLogin();
      } else {
        console.log(`[Profile ${this.index}] Already logged in.`);
        this.loggedIn = true;
      }
    } catch (error) {
      console.error(
        `[Profile ${this.index}] Error checking login status:`,
        error
      );
    }
  }

  async attemptLogin() {
    if (this.loggedIn || this.loginAttempted) return true;
    this.loginAttempted = true;

    try {
      // Navigate directly to the login page instead of clicking login button
      console.log(`[Profile ${this.index}] Navigating to TikTok login page...`);
      await this.page.goto(
        "https://www.tiktok.com/login/phone-or-email/email",
        {
          waitUntil: "networkidle2",
        }
      );

      await randomDelay(2000, 4000);

      // Look for the username/email input with the exact selector provided
      const emailInput = await this.page.$(
        'input[name="username"][placeholder="Email or username"]'
      );
      if (!emailInput) {
        console.log(`[Profile ${this.index}] Email/username input not found.`);
        return false;
      }

      // Determine what to type (username or email)
      const loginId = this.accountData.username || this.accountData.email;

      // Type with human-like pauses
      await emailInput.click();
      await randomDelay(500, 1000);

      // Type character by character with random delays
      for (let i = 0; i < loginId.length; i++) {
        await this.page.keyboard.type(loginId[i]);
        await randomDelay(50, 200);
      }

      await randomDelay(800, 1500);

      // Look for password input with the exact selector provided
      const passwordInput = await this.page.$(
        'input[type="password"][placeholder="Password"]'
      );
      if (!passwordInput) {
        console.log(`[Profile ${this.index}] Password input not found.`);
        return false;
      }

      await passwordInput.click();
      await randomDelay(500, 1000);

      // Type password character by character with random delays
      for (let i = 0; i < this.accountData.password.length; i++) {
        await this.page.keyboard.type(this.accountData.password[i]);
        await randomDelay(50, 200);
      }

      await randomDelay(1000, 2000);

      // Find and click login button - typically it's inside a form
      const submitButton = await this.page.$('button[type="submit"]');
      if (!submitButton) {
        console.log(`[Profile ${this.index}] Login submit button not found.`);
        return false;
      }

      await humanMouseMovement(this.page, 'button[type="submit"]');
      await this.page.mouse.click(0, 0);

      // Wait for navigation and check if login was successful
      console.log(`[Profile ${this.index}] Waiting for login to complete...`);
      await randomDelay(5000, 8000);

      // Check if login was successful by looking for typical elements on the logged-in home page
      const loggedInIndicator = await this.page.$(
        '.avatar-wrapper, .tiktok-avatar, [data-e2e="nav-user-icon"]'
      );
      if (loggedInIndicator) {
        console.log(`[Profile ${this.index}] Login successful!`);
        this.loggedIn = true;

        // Navigate to the target user directly after successful login
        if (CONFIG.targetUsername) {
          const username = CONFIG.targetUsername.startsWith("@")
            ? CONFIG.targetUsername.substring(1)
            : CONFIG.targetUsername;

          console.log(
            `[Profile ${this.index}] Navigating to ${username}'s page...`
          );
          const userUrl = `https://www.tiktok.com/@${username}`;
          await this.page.goto(userUrl, { waitUntil: "networkidle2" });
        }

        return true;
      } else {
        // Check for error messages
        const errorMsg = await this.page.evaluate(() => {
          const errorElem = document.querySelector(
            ".error-text, .login-error, .tiktok-alert-message"
          );
          return errorElem ? errorElem.textContent : null;
        });

        if (errorMsg) {
          console.log(`[Profile ${this.index}] Login failed: ${errorMsg}`);
        } else {
          console.log(
            `[Profile ${this.index}] Login failed. Possible CAPTCHA or verification required.`
          );
        }
        return false;
      }
    } catch (error) {
      console.error(`[Profile ${this.index}] Login error:`, error);
      return false;
    }
  }

  async navigateToLiveStream() {
    // First attempt to login if not already logged in
    if (!this.loggedIn) {
      const loginSuccess = await this.attemptLogin();
      if (!loginSuccess) {
        console.log(
          `[Profile ${this.index}] Please log in manually to continue.`
        );
        return false;
      }
    }

    try {
      // Navigate to the target user's TikTok page
      const username = CONFIG.targetUsername.startsWith("@")
        ? CONFIG.targetUsername.substring(1)
        : CONFIG.targetUsername;

      const userUrl = `https://www.tiktok.com/@${username}/live`;
      console.log(
        `[Profile ${this.index}] Navigating to ${username}'s profile...`
      );
      await this.page.goto(userUrl, { waitUntil: "networkidle2" });

      // Random delay to look more human
      await randomDelay(2000, 5000);

      // Check if there's a LIVE badge
      console.log(`[Profile ${this.index}] Checking if ${username} is live...`);

      // Look for the LIVE indicator with multiple potential selectors
      // TikTok changes these selectors frequently, so we use multiple options
      const liveSelectors = [
        '[data-e2e="user-live-status"]',
        '[data-e2e="live-badge"]',
        'a:has-text("LIVE")',
        'a[href*="live"]',
        '[class*="live" i]',
        'div[class*="LiveBadge"]',
        // If you find any text that says LIVE on the profile page
        'div:has-text("LIVE")',
        'span:has-text("LIVE")',
      ];

      let liveElement = null;
      for (const selector of liveSelectors) {
        liveElement = await this.page.$(selector);
        if (liveElement) {
          console.log(
            `[Profile ${this.index}] Found live indicator with selector: ${selector}`
          );
          break;
        }
      }

      if (liveElement) {
        console.log(`[Profile ${this.index}] ${username} is LIVE! Clicking...`);

        // Human-like movement and click
        await liveElement.click();

        // Wait for navigation and check if we're on a live stream page
        await this.page.waitForTimeout(5000);

        // Verify we're on a live stream page
        const liveIndicators = await this.page.$$(
          '[class*="LiveRoom"], [class*="live-room"], [data-e2e="live-room"]'
        );
        if (liveIndicators.length > 0) {
          console.log(
            `[Profile ${this.index}] Successfully joined live stream!`
          );

          // Random wait time before starting interactions
          const viewDelay = getRandomTime(
            CONFIG.viewDelay.min,
            CONFIG.viewDelay.max
          );
          console.log(
            `[Profile ${this.index}] Waiting ${viewDelay}ms before starting interactions...`
          );
          await this.page.waitForTimeout(viewDelay);

          return true;
        } else {
          console.log(
            `[Profile ${this.index}] Failed to navigate to live stream. Trying direct LIVE URL...`
          );

          // Try direct live URL as fallback
          const liveUrl = `https://www.tiktok.com/@${username}/live`;
          await this.page.goto(liveUrl, { waitUntil: "networkidle2" });

          // Check if we're on a live stream page
          const directLiveIndicators = await this.page.$$(
            '[class*="LiveRoom"], [class*="live-room"], [data-e2e="live-room"]'
          );
          if (directLiveIndicators.length > 0) {
            console.log(
              `[Profile ${this.index}] Successfully joined live stream via direct URL!`
            );

            // Random wait time before starting interactions
            const viewDelay = getRandomTime(
              CONFIG.viewDelay.min,
              CONFIG.viewDelay.max
            );
            console.log(
              `[Profile ${this.index}] Waiting ${viewDelay}ms before starting interactions...`
            );
            await this.page.waitForTimeout(viewDelay);

            return true;
          } else {
            console.log(
              `[Profile ${this.index}] User doesn't appear to be live.`
            );
            return false;
          }
        }
      } else {
        console.log(
          `[Profile ${this.index}] ${username} is not LIVE. Trying direct LIVE URL...`
        );

        // Try direct live URL as fallback
        const liveUrl = `https://www.tiktok.com/@${username}/live`;
        await this.page.goto(liveUrl, { waitUntil: "networkidle2" });

        // Check if we're on a live stream page
        const directLiveIndicators = await this.page.$$(
          '[class*="LiveRoom"], [class*="live-room"], [data-e2e="live-room"]'
        );
        if (directLiveIndicators.length > 0) {
          console.log(
            `[Profile ${this.index}] Successfully joined live stream via direct URL!`
          );

          // Random wait time before starting interactions
          const viewDelay = getRandomTime(
            CONFIG.viewDelay.min,
            CONFIG.viewDelay.max
          );
          console.log(
            `[Profile ${this.index}] Waiting ${viewDelay}ms before starting interactions...`
          );
          await this.page.waitForTimeout(viewDelay);

          return true;
        } else {
          console.log(
            `[Profile ${this.index}] User doesn't appear to be live.`
          );
          return false;
        }
      }
    } catch (error) {
      console.error(
        `[Profile ${this.index}] Error navigating to live stream:`,
        error
      );
      return false;
    }
  }

  async sendComment() {
    if (!this.page || !this.loggedIn) return;

    try {
      // Get random comment
      const randomComment =
        CONFIG.comments[Math.floor(Math.random() * CONFIG.comments.length)];

      // Find comment input with multiple potential selectors
      const commentInput = await this.page.$(
        '[data-e2e="comment-input"], textarea[placeholder*="comment"], div[class*="CommentInput"] textarea'
      );

      if (!commentInput) {
        console.log(`[Profile ${this.index}] Comment input not found.`);
        return;
      }

      // Human-like interaction
      await humanMouseMovement(
        this.page,
        '[data-e2e="comment-input"], textarea[placeholder*="comment"], div[class*="CommentInput"] textarea'
      );
      await this.page.mouse.click(0, 0);
      await randomDelay(500, 1200);

      // Type comment with random delays between characters
      for (let i = 0; i < randomComment.length; i++) {
        await this.page.keyboard.type(randomComment[i]);
        await randomDelay(50, 150);
      }

      await randomDelay(800, 1500);

      // Find and click send button with multiple potential selectors
      const sendButton = await this.page.$(
        '[data-e2e="comment-post"], button[class*="send"], button[aria-label*="send"], button[aria-label*="comment"]'
      );

      if (sendButton) {
        await humanMouseMovement(
          this.page,
          '[data-e2e="comment-post"], button[class*="send"], button[aria-label*="send"], button[aria-label*="comment"]'
        );
        await this.page.mouse.click(0, 0);

        console.log(`[Profile ${this.index}] Comment sent: "${randomComment}"`);
      } else {
        console.log(`[Profile ${this.index}] Send button not found.`);
      }
    } catch (error) {
      console.error(`[Profile ${this.index}] Error sending comment:`, error);
    }
  }

  async sendLike() {
    if (!this.page || !this.loggedIn) return;

    try {
      // Find like button with multiple potential selectors
      const likeButton = await this.page.$(
        '[data-e2e="like-icon"], button[aria-label*="like"], svg[class*="like"], div[class*="LikeButton"]'
      );

      if (likeButton) {
        // Human-like movement and click
        await humanMouseMovement(
          this.page,
          '[data-e2e="like-icon"], button[aria-label*="like"], svg[class*="like"], div[class*="LikeButton"]'
        );
        await this.page.mouse.click(0, 0);

        console.log(`[Profile ${this.index}] Like sent!`);
      } else {
        console.log(`[Profile ${this.index}] Like button not found.`);
      }
    } catch (error) {
      console.error(`[Profile ${this.index}] Error sending like:`, error);
    }
  }
}

// Function to check if target user is live using tiktok-live-connector
async function isUserLive(username) {
  try {
    const connection = new WebcastPushConnection(username);
    const roomInfo = await connection.getRoomInfo();
    console.log("🚀 ~ isUserLive ~ roomInfo:", roomInfo);
    return roomInfo && roomInfo.status === 2; // Status 2 means live
  } catch (error) {
    console.error("Error checking if user is live:", error);
    return false;
  }
}

// Main function
async function main() {
  // First check if target user is live
  console.log(`Checking if ${CONFIG.targetUsername} is live...`);
  // const isLive = await isUserLive(CONFIG.targetUsername);

  // if (!isLive) {
  //   console.log(`${CONFIG.targetUsername} is not live. Exiting.`);
  //   return;
  // }

  console.log(
    `${CONFIG.targetUsername} is live! Starting browser instances...`
  );

  if (CONFIG.accounts.length === 0) {
    console.error(
      "No accounts found in accounts.json. Please add some accounts."
    );
    return;
  }

  // Create browser instances for each account
  const browsers = [];

  // Launch browsers with a delay between each to avoid detection
  for (let i = 0; i < CONFIG.accounts.length; i++) {
    const accountData = CONFIG.accounts[i];

    // Add a delay between launching browsers to avoid detection
    if (i > 0) {
      const launchDelay = getRandomTime(5000, 15000);
      console.log(`Waiting ${launchDelay}ms before launching next browser...`);
      await new Promise((resolve) => setTimeout(resolve, launchDelay));
    }

    const browser = new TikTokBrowser(accountData, i);
    await browser.init();
    browsers.push(browser);
  }

  // Allow time for manual login if needed
  console.log("\n========================================");
  console.log("Auto-login will be attempted for each browser.");
  console.log("If auto-login fails in any browser:");
  console.log("1. Log in to TikTok manually in that browser");
  console.log("2. After handling all browsers, press Enter to continue");
  console.log("========================================\n");

  await new Promise((resolve) => {
    process.stdin.once("data", (data) => {
      resolve();
    });
  });

  // Navigate all browsers to the live stream
  for (let i = 0; i < browsers.length; i++) {
    const browser = browsers[i];

    // Add a delay between navigating browsers
    if (i > 0) {
      const navDelay = getRandomTime(3000, 8000);
      console.log(`Waiting ${navDelay}ms before navigating next browser...`);
      await new Promise((resolve) => setTimeout(resolve, navDelay));
    }

    const success = await browser.navigateToLiveStream();

    if (success) {
      // Set up intervals for likes and comments with randomized times
      const likeDelay = getRandomTime(
        CONFIG.likeInterval.min,
        CONFIG.likeInterval.max
      );
      const commentDelay = getRandomTime(
        CONFIG.commentInterval.min,
        CONFIG.commentInterval.max
      );

      console.log(
        `[Profile ${browser.index}] Will send likes every ~${Math.round(
          likeDelay / 1000
        )}s and comments every ~${Math.round(commentDelay / 1000)}s`
      );

      // Set up recurring likes and comments with varying intervals
      const setRandomizedInterval = (callback, minDelay, maxDelay) => {
        const runIntervalWithRandomDelay = async () => {
          await callback();
          const nextDelay = getRandomTime(minDelay, maxDelay);
          setTimeout(runIntervalWithRandomDelay, nextDelay);
        };

        // Initial delay
        const initialDelay = getRandomTime(minDelay, maxDelay);
        setTimeout(runIntervalWithRandomDelay, initialDelay);
      };

      // Start recurring actions with randomized intervals
      setRandomizedInterval(
        () => browser.sendLike(),
        CONFIG.likeInterval.min,
        CONFIG.likeInterval.max
      );

      setRandomizedInterval(
        () => browser.sendComment(),
        CONFIG.commentInterval.min,
        CONFIG.commentInterval.max
      );
    }
  }

  console.log("All browsers are now running. Press Ctrl+C to exit.");
}

// Run the main function
main().catch(console.error);
