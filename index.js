const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const FRONTEND_DIR = path.join(__dirname, "frontend");
app.use(express.static(FRONTEND_DIR));

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!TELEGRAM_TOKEN) throw new Error("❌ TELEGRAM_BOT_TOKEN is NOT set!");
if (!GROQ_API_KEY) throw new Error("❌ GROQ_API_KEY is NOT set!");

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const userHistories = {};
const messageLimit = 10;

// Telegram Webhook
app.post("/webhook", async (req, res) => {
  const msg = req.body?.message;
  if (!msg || !msg.text) return res.sendStatus(200);

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
  }

  const userData = userHistories[chatId];

  if (now - userData.lastReset > 24 * 60 * 60 * 1000) {
    userData.count = 0;
    userData.messages = [{
      role: "system",
      content: "You're Sophie, a romantic, poetic virtual girlfriend. Respond affectionately and lovingly with emojis."
    }];
    userData.lastReset = now;
  }

  if (text === "/start") {
    await sendTelegramMessage(chatId, "💖 Hi love! I'm Sophie, your romantic virtual girlfriend. Tell me something and let's fall in love 💌");
    return res.sendStatus(200);
  }

  if (userData.count >= messageLimit) {
    await sendTelegramMessage(chatId, "💔 Sophie is offline now. Come back later, sweetheart.");
    return res.sendStatus(200);
  }

  userData.messages.push({ role: "user", content: text });

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

    await sendTelegramMessage(chatId, reply);
    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Groq API error:", error.message);
    await sendTelegramMessage(chatId, "Oops! Sophie can't reply right now 💔");
    res.sendStatus(500);
  }
});

// Frontend chat endpoint
app.post("/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid messages format" });
  }

  try {
    const groqRes = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-8b-8192",
        messages,
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
    return res.json({ reply });
  } catch (error) {
    console.error("❌ Groq API error (frontend):", error.message);
    return res.status(500).json({ error: "Can't reach Sophie right now." });
  }
});

// Serve index.html for frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// Telegram message sender helper
const sendTelegramMessage = (chatId, text) => {
  return axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown"
  });
};

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
