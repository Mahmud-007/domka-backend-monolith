import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const backend = process.env.MODEL_BACKEND || "ollama";
const model =
  backend === "openai"
    ? process.env.OPENAI_MODEL || "gpt-4o-mini"
    : process.env.OLLAMA_MODEL || "llama3.2";

async function queryModel(prompt) {
  if (backend === "ollama") {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt }),
    });
    let text = "";
    for await (const chunk of res.body) text += Buffer.from(chunk).toString();
    const parsed = text
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l).response)
      .join("");
    return parsed.trim();
  } else if (backend === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  }
  throw new Error("Unknown backend selected");
}

const folder = "../articles";
const files = fs.readdirSync(folder).filter((f) => f.endsWith(".json"));
let allArticles = [];
for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(folder, file)));
    allArticles.push(...data);
  } catch (e) {
    console.error("❌ Failed to read", file, e);
  }
}

const seen = new Set();
allArticles = allArticles.filter((a) => {
  if (!a.article_title || seen.has(a.article_title)) return false;
  seen.add(a.article_title);
  return a.article_body && a.article_body.length > 50;
});

console.log(`📰 Valid articles: ${allArticles.length}`);

const results = [];
for (const art of allArticles) {
  const prompt = `
তুমি একটি সামাজিক মাধ্যম বিশেষজ্ঞ।
নিচের সংবাদটি পড়ে অনুমান করো এটি কতটা ভাইরাল হতে পারে (০ থেকে ১০০ স্কোর)।
তারপর আকর্ষণীয় বাংলা ক্যাপশন লেখো (Facebook পোস্টের উপযোগী)।
এবং কোন UTC সময়ে পোস্ট করলে সবচেয়ে ভালো হবে তা বলো।

JSON আকারে দাও:
{"score": number, "caption": "string", "best_post_time_utc": "HH:MM"}
আউটপুটের JSON স্কিমা:
{
  "score": 0-100 (integer),
  "caption": "Bangla one-line sentence",
  "best_post_time_utc": "HH:MM"
}
  
শিরোনাম: ${art.article_title}
বিবরণ: ${art.article_body?.slice(0, 700)}
	`;

  console.log(`⚙️ Evaluating: ${art.article_title.slice(0, 60)}...`);

  try {
    const raw = await queryModel(prompt);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { score: 0, caption: raw, best_post_time_utc: "12:00" };
    }
    results.push({
      ...art,
      ...parsed,
      filtered_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("⚠️ Error for", art.article_title, err);
  }
}

results.sort((a, b) => b.score - a.score);
fs.mkdirSync("../output", { recursive: true });
fs.writeFileSync(
  "../output/article_filtered-2.json",
  JSON.stringify(results, null, 2)
);

console.log("✅ Done — saved at ./output/article_filtered.json");
