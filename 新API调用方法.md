# nano bananan 调用方法

1 Install the Gen AI SDK.
npm install @google/genai
export GOOGLE_CLOUD_API_KEY="YOUR_API_KEY"

2 Create an index.js file and add the following code:
import { GoogleGenAI } from '@google/genai';

// Initialize Vertex with your Cloud project and location
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_CLOUD_API_KEY,
});
const model = 'gemini-3-pro-image-preview';


// Set up generation config
const generationConfig = {
  maxOutputTokens: 32768,
  temperature: 1,
  topP: 0.95,
  responseModalities: ["TEXT", "IMAGE"],
  imageConfig: {
    aspectRatio: "9:16",
    imageSize: "2K",
    outputMimeType: "image/png",
  },
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'OFF',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'OFF',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'OFF',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'OFF',
    }
  ],
};

const msg1Text1 = {text: `Cinematic low-angle rear view of two motorcyclists riding a black and white sport motorcycle on a winding coastal highway at golden hour. The rider in front wears a black helmet and leather jacket, the passenger behind also in black gear with a colorful helmet. Their backs are visible, slightly leaning forward as if speeding. The road curves along a cliffside overlooking the ocean, surrounded by autumn trees with orange and red leaves. Bright sunlight casts long shadows across the asphalt. Hyper-realistic, detailed textures, motion blur on wheels, dramatic lighting, filmic depth of field. Style of professional automotive photography meets cinematic action scene.”`};

const chat = ai.chats.create({
  model: model,
  config: generationConfig
});

async function sendMessage(message) {
  const response = await chat.sendMessageStream({
    message: message
  });
  process.stdout.write('stream result: ');
  for await (const chunk of response) {
    if (chunk.text) {
      process.stdout.write(chunk.text);
    } else {
      process.stdout.write(JSON.stringify(chunk) + '\n');
    }
  }
}

async function generateContent() {
  await sendMessage([
    msg1Text1
  ]);
}

generateContent();

3 Run the code.
node index.js


# LLM  gemini调用方法

import { GoogleGenAI } from '@google/genai';

// Initialize Vertex with your Cloud project and location
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_CLOUD_API_KEY,
});
const model = 'gemini-3-flash-preview';


// Set up generation config
const generationConfig = {
  maxOutputTokens: 65535,
  temperature: 1,
  topP: 0.95,
  seed: 0,
  thinkingConfig: {
    thinkingLevel: "HIGH",
  },
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'OFF',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'OFF',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'OFF',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'OFF',
    }
  ],
};

const image1 = {
  fileData: {
    mimeType: 'image/png',
    fileUri: 'gs://cloud-samples-data/generative-ai/image/homework.png'
  }
};

async function generateContent() {
  const req = {
    model: model,
    contents: [
      {role: 'user', parts: [image1, {text: `Answer the question in the image with step by step solution.`}]}
    ],
    config: generationConfig,
  };

  const streamingResp = await ai.models.generateContentStream(req);

  for await (const chunk of streamingResp) {
    if (chunk.text) {
      process.stdout.write(chunk.text);
    } else {
      process.stdout.write(JSON.stringify(chunk) + '\n');
    }
  }
}

generateContent();