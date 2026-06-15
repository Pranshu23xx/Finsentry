// Please install OpenAI SDK first: `npm install openai`

import OpenAI from "openai";
import 
const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: "sk-77204ca0154c478bb7557c02de8b2334",
});

async function main() {
  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: "design me a  " }],
    model: "deepseek-v4-pro",
    thinking: {"type": "enabled"},
    reasoning_effort: "high",
    stream: false,
  });

  console.log(completion.choices[0].message.content);
}

main();