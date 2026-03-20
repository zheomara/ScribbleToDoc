import OpenAI from "openai";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { base64Image, language } = req.body;
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY environment variable is required" });
    }

    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Transcribe the handwritten text in this image accurately. Maintain original paragraphs and structure. If you detect tabular data or tables, format them cleanly as Markdown tables. Language: ${language}. Output ONLY the transcribed text without any greetings or explanations.` },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content || "No text detected in the image.";
    res.status(200).json({ text });
  } catch (error: any) {
    console.error("OpenAI OCR failed:", error);
    res.status(500).json({ error: error.message || "Failed to extract text using OpenAI" });
  }
}
