module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const { idea } = req.body || {};

    if (!idea || typeof idea !== "string" || idea.trim().length < 2) {
      return res.status(400).json({
        error: "Please enter a valid idea."
      });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({
        error: "DeepSeek API key is not configured."
      });
    }

    const userIdea = idea.trim().slice(0, 500);

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
              "You are an expert AI image prompt writer. Detect the user's input language and write the final answer in the same language. If the user writes in Korean, answer in Korean. If the user writes in English, answer in English. If the user writes in Vietnamese, answer in Vietnamese. Create one detailed image-generation text prompt. Return only the final prompt. Do not add explanations, markdown, titles, quotes, emojis, icons, flags, or bullet points."
          },
          {
            role: "user",
            content:
              `Create a detailed AI image prompt from this idea. Use the same language as the user's input: ${userIdea}`
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

    const generatedPrompt = data.choices?.[0]?.message?.content?.trim();

    if (!generatedPrompt) {
      return res.status(500).json({
        error: "No prompt was generated."
      });
    }

    return res.status(200).json({
      prompt: generatedPrompt
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error."
    });
  }
};
