// ============================================================
//  LINE Bot × Google Gemini API  — 主程式
//  使用方式：
//    1. 安裝套件：npm install express @line/bot-sdk axios
//    2. 建立 .env 檔案，填入三個 Key（見下方說明）
//    3. 執行：node index.js
// ============================================================
//
//  .env 檔案內容（新增 .env 檔案，填入你自己的 Key）：
//  -------------------------------------------------------
//  LINE_CHANNEL_ACCESS_TOKEN=你的LINE_Channel_Access_Token
//  LINE_CHANNEL_SECRET=你的LINE_Channel_Secret
//  GEMINI_API_KEY=你的Google_Gemini_API_Key
//  -------------------------------------------------------

const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');

const app = express();

// ── LINE 設定 ────────────────────────────────────────────────
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

// ── 對話記憶（每位使用者各自儲存） ──────────────────────────
const userHistory = {};

// ── 呼叫 Gemini API ──────────────────────────────────────────
async function askGemini(userId, userMessage) {
  // 初始化該使用者的歷史紀錄
  if (!userHistory[userId]) {
    userHistory[userId] = [];
  }

  // 把這次使用者說的話加進歷史
  userHistory[userId].push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  // 呼叫 Gemini API
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      // System Prompt：設定 AI 的角色與語言
      // 可以自行修改這段文字，讓 AI 扮演不同角色
      system_instruction: {
        parts: [{ text: '你是一個親切有耐心的教學助理，請用繁體中文回答。' }],
      },
      contents: userHistory[userId],
    }
  );

  // 取出 Gemini 回答的文字
  const reply = response.data.candidates[0].content.parts[0].text;

  // 把 AI 的回答也存進歷史，讓下一輪對話有記憶
  userHistory[userId].push({
    role: 'model',
    parts: [{ text: reply }],
  });

  // 避免歷史太長，只保留最近 20 筆（10 輪對話）
  if (userHistory[userId].length > 20) {
    userHistory[userId] = userHistory[userId].slice(-20);
  }

  return reply;
}

// ── 接收 LINE Webhook ────────────────────────────────────────
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  // 先回應 LINE，避免 timeout（LINE 要求 1 秒內回應）
  res.status(200).send('OK');

  const events = req.body.events;

  for (const event of events) {
    // 只處理「文字訊息」類型
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const userMessage = event.message.text;

      try {
        // 問 Gemini，取得回覆
        const reply = await askGemini(userId, userMessage);

        // 透過 LINE 回覆給使用者
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: reply }],
        });
      } catch (err) {
        console.error('發生錯誤：', err.message);
      }
    }
  }
});

// ── 啟動 Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server 已啟動，Port: ${PORT}`);
});
