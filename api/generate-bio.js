module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const { description } = req.body || {};

    if (!description || typeof description !== "string" || description.trim().length < 2) {
      return res.status(400).json({
        error: "Please enter a valid description."
      });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({
        error: "DeepSeek API key is not configured."
      });
    }

    const userDescription = description.trim().slice(0, 400);

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
              "You are an expert bio writer for social media profiles, websites, creator pages, and small businesses. Detect the user's input language and write the answer in the same language. If the user writes in Korean, answer in Korean. If the user writes in English, answer in English. If the user writes in Vietnamese, answer in Vietnamese. Create 5 useful short bios. Return only the bios. Do not add explanations, markdown, emojis, icons, flags, or special symbols."
          },
          {
            role: "user",
            content:
              `Create 5 different short profile bios from this description. Use the same language as the user's input: ${userDescription}`
          }
        ],
        temperature: 0.8,
        max_tokens: 350
      })
    });

    const data = await deepseekResponse.json();

    if (!deepseekResponse.ok) {
      return res.status(deepseekResponse.status).json({
        error: data.error?.message || "DeepSeek API request failed."
      });
    }

    const bio = data.choices?.[0]?.message?.content?.trim();

    if (!bio) {
      return res.status(500).json({
        error: "No bio was generated."
      });
    }

    return res.status(200).json({
      bio
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error."
    });
  }
};
