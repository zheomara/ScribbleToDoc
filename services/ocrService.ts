
import { GoogleGenAI } from "@google/genai";
import { OCRConfig } from '../types.ts';
import Tesseract from 'tesseract.js';

/**
 * Processes an image using Gemini-3-flash-preview to perform OCR on handwritten text.
 * Uses the API key from the environment.
 * Falls back to Tesseract.js if offline.
 */
export const processImageOCR = async (
  imageUrl: string, 
  config: OCRConfig, 
  onProgress: (progress: number) => void
): Promise<string> => {
  const img = new Image();
  img.src = imageUrl;
  
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  // Optimize performance by resizing large images before processing
  const MAX_DIMENSION = 1024;
  let width = img.width;
  let height = img.height;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.drawImage(img, 0, 0, width, height);

  // Apply grayscale and contrast enhancements if requested to improve legibility
  if (config.grayscale) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const contrastFactor = config.contrast;
      const newValue = (avg - 128) * contrastFactor + 128;
      data[i] = data[i+1] = data[i+2] = newValue;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  const processedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const base64Data = processedDataUrl.split(',')[1];

  onProgress(0.3); // Mark initial pre-processing as 30% complete

  // Offline Fallback using Tesseract.js
  if (!navigator.onLine) {
    console.log("Offline mode detected. Falling back to local Tesseract.js OCR.");
    try {
      // Map language codes (Gemini uses standard names/codes, Tesseract uses specific 3-letter codes)
      const tessLang = config.language.toLowerCase().startsWith('es') ? 'spa' 
                     : config.language.toLowerCase().startsWith('fr') ? 'fra' 
                     : config.language.toLowerCase().startsWith('de') ? 'deu' 
                     : 'eng';

      const worker = await Tesseract.createWorker(tessLang, 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            // Map Tesseract progress (0-1) to our remaining 30-100% progress
            onProgress(0.3 + (m.progress * 0.7));
          }
        }
      });
      
      const ret = await worker.recognize(processedDataUrl);
      await worker.terminate();
      onProgress(1.0);
      return ret.data.text || "No text detected in the image.";
    } catch (error) {
      console.error("Offline OCR failed:", error);
      throw new Error("Offline OCR failed. Please try again or connect to the internet.");
    }
  }

  try {
    // Access the API key directly from process.env as per guidelines
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
          {
            text: `Transcribe the handwritten text in this image accurately. 
            Maintain original paragraphs and structure. 
            If you detect tabular data or tables, format them cleanly as Markdown tables.
            Language: ${config.language}. 
            Output ONLY the transcribed text without any greetings or explanations.`
          },
        ],
      },
    });

    onProgress(1.0);
    return response.text || "No text detected in the image.";
  } catch (error) {
    console.warn("OCR process failed with Gemini API, attempting ChatGPT fallback:", error);
    
    try {
      const fallbackResponse = await fetch('/api/ocr-openai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          base64Image: base64Data,
          language: config.language
        })
      });

      if (!fallbackResponse.ok) {
        const errorData = await fallbackResponse.json();
        throw new Error(errorData.error || "ChatGPT fallback failed");
      }

      const data = await fallbackResponse.json();
      onProgress(1.0);
      return data.text || "No text detected in the image.";
    } catch (fallbackError) {
      console.error("Both Gemini and ChatGPT fallback failed:", fallbackError);
      throw new Error("Failed to extract text. Both primary and fallback AI services encountered an error.");
    }
  }
};
