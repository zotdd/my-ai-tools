module.exports = async function handler(req, res) {
  // Only allow POST requests
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
              "You are an expert AI image prompt writer. Create one detailed English image-generation prompt. Return only the final prompt. Do not add explanations, markdown, titles, quotes, or bullet points."
          },
          {
            role: "user",
            content:
              `Create a detailed AI image prompt from this idea: ${userIdea}`
          }
        ],
        temperature: 0.8,
        max_tokens: 300
      })
    });

    const data = await deepseekResponse.json();

    if (!deepseekResponse.ok) {
      return res.status(deepseekResponse.status).json({
        error: data.error?.message || "DeepSeek API request failed."
      });
    }

    const generatedPrompt =
      data.choices?.[0]?.message?.content?.trim();

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
