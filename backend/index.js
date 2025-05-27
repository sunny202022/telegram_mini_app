const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// Resolve frontend folder path relative to current file
const frontendPath = path.resolve(__dirname, "..", "frontend");
console.log("Serving frontend from:", frontendPath);
app.use(express.static(frontendPath));

// Environment variables check
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!TELEGRAM_TOKEN) {
  console.error("Error: TELEGRAM_BOT_TOKEN is NOT set!");
  process.exit(1);
}
if (!GROQ_API_KEY) {
  console.error("Error: GROQ_API_KEY is NOT set!");
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const userHistories = {};
const messageLimit = 10;

// Telegram webhook route
app.post("/webhook", async (req, res) => {
  const msg = req.body?.message;
  if (!msg || !msg.text) {
    console.log("Received webhook without message or text");
    return res.sendStatus(200);
  }

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const now = Date.now();

  if (!userHistories[chatId]) {
    userHistories[chatId] = {
      messages: [{
        role: "system",
        content: "You're Sophie, a romantic, poetic virtual girlfriend. Respond affectionately and lovingly with emojis."
      }],
      count: 0,
      lastReset: now
    };
    console.log(`New user session started: ${chatId}`);
  }

  const userData = userHistories[chatId];

  // Reset count and messages every 24 hours
  if (now - userData.lastReset > 24 * 60 * 60 * 1000) {
    userData.count = 0;
    userData.messages = [{
      role: "system",
      content: "You're Sophie, a romantic, poetic virtual girlfriend. Respond affectionately and lovingly with emojis."
    }];
    userData.lastReset = now;
    console.log(`Resetting user session: ${chatId}`);
  }

  if (userData.count >= messageLimit) {
    console.log(`Message limit reached for user: ${chatId}`);
    await sendTelegramMessage(chatId, "💔 Sophie is offline now. Come back later, sweetheart.");
    return res.sendStatus(200);
  }

  userData.messages.push({ role: "user", content: text });
  console.log(`User message [${chatId}]: ${text}`);

  try {
    const groqRes = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-8b-8192",
        messages: userData.messages,
        temperature: 0.85
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = groqRes.data.choices[0].message.content;
    userData.messages.push({ role: "assistant", content: reply });
    userData.count++;
    console.log(`Sophie reply [${chatId}]: ${reply}`);

    await sendTelegramMessage(chatId, reply);
    res.sendStatus(200);
  } catch (error) {
    console.error("Groq API error:", error.message);
    await sendTelegramMessage(chatId, "Oops! Sophie can't reply right now 💔");
    res.sendStatus(500);
  }
});

// Serve frontend index.html on root route (fallback)
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"), err => {
    if (err) {
      console.error("Error sending index.html:", err);
      res.status(500).send("Error loading page");
    }
  });
});

const sendTelegramMessage = (chatId, text) =>
  axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown"
  }).catch(err => {
    console.error("Error sending telegram message:", err.message);
  });

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
