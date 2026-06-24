module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const { topic } = req.body || {};

    if (!topic || typeof topic !== "string" || topic.trim().length < 2) {
      return res.status(400).json({
        error: "Please enter a valid topic."
      });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({
        error: "DeepSeek API key is not configured."
      });
    }

    const userTopic = topic.trim().slice(0, 300);

    const deepseekResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        thinking: {
          type: "disabled"
        },
        messages: [
          {
            role: "system",
            content:
              "You are a social media hashtag expert. Detect the user's input language and generate hashtags in the same language. If the user writes in Korean, generate Korean hashtags. If the user writes in English, generate English hashtags. If the user writes in Vietnamese, generate Vietnamese hashtags. Generate useful hashtags for Instagram, TikTok, YouTube Shorts, X, and social media posts. Return only hashtags grouped in clean lines. Use hashtag format with #. Do not add explanations, markdown, emojis, icons, flags, or unrelated symbols."
          },
          {
            role: "user",
            content:
              `Generate 30 useful hashtags for this topic. Use the same language as the user's input: ${userTopic}`
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    const data = await deepseekResponse.json();

    if (!deepseekResponse.ok) {
      return res.status(deepseekResponse.status).json({
        error: data.error?.message || "DeepSeek API request failed."
      });
    }

    const hashtags = data.choices?.[0]?.message?.content?.trim();

    if (!hashtags) {
      return res.status(500).json({
        error: "No hashtags were generated."
      });
    }

    return res.status(200).json({
      hashtags
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error."
    });
  }
};
