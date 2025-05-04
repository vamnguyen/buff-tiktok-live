const { WebcastPushConnection } = require("tiktok-live-connector");
const { USERNAME } = require("./constant");

// TikTok username to monitor (e.g., "@username")
const username = USERNAME;
if (!username) {
  console.error("Please set USERNAME");
  process.exit(1);
}

// Initialize connection
const connection = new WebcastPushConnection(username);

// Metrics counters
const metrics = {
  viewers: 0,
  comments: 0,
  gifts: 0,
  followers: 0,
  shares: 0,
};

// Function to fetch and log viewer count
async function updateViewerCount() {
  try {
    const roomInfo = await connection.getRoomInfo();
    // viewer_count may vary by version; adjust if field name is different
    metrics.viewers = roomInfo.user_count || 0;
    console.log(`[VIEWERS] ${metrics.viewers}`);
  } catch (err) {
    console.error("Error fetching room info:", err);
  }
}

// Event: chat message (comment)
connection.on("chat", (data) => {
  metrics.comments++;
  console.log(`[CHAT #${metrics.comments}] ${data.uniqueId}: ${data.comment}`);
});

// Event: gift received
connection.on("gift", (data) => {
  metrics.gifts++;
  console.log(
    `[GIFT #${metrics.gifts}] ${data.uniqueId} sent ${data.giftName} (x${data.repeatCount})`
  );
});

// Event: new follower
connection.on("follow", (data) => {
  metrics.followers++;
  console.log(`[FOLLOW #${metrics.followers}] ${data.uniqueId} followed`);
});

// Event: stream shared
connection.on("share", (data) => {
  metrics.shares++;
  console.log(`[SHARE #${metrics.shares}] ${data.uniqueId} shared the stream`);
});

// Connect and start monitoring
(async () => {
  try {
    console.log(`Connecting to TikTok LIVE for ${username}...`);
    await connection.connect();
    console.log("Connected!");

    // Initial fetch
    await updateViewerCount();
    // Update viewer count every 30 seconds
    setInterval(updateViewerCount, 30 * 1000);
  } catch (err) {
    console.error("Connection error:", err);
    process.exit(1);
  }
})();
