import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
import FormData from "form-data";
// import fs from "fs/promises";

const data =  fs.readFile("../articles/prothomalo.json", "utf-8");
const articles = JSON.parse(data);
dotenv.config();

const PAGE_ID = process.env.PAGE_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

if (!PAGE_ID || !ACCESS_TOKEN) {
  throw new Error("⚠️ Missing PAGE_ID or ACCESS_TOKEN in .env");
}

/**
 * Upload an image to the page
 */
async function uploadImage(imageUrl) {
  const form = new FormData();
  form.append("source", fs.createReadStream(imageUrl));
  form.append("published", "true"); // Don't publish yet
  form.append("access_token", ACCESS_TOKEN);

  const response = await axios.post(
    `https://graph.facebook.com/${PAGE_ID}/photos`,
    form,
    { headers: form.getHeaders() }
  );

  console.log("✅ Image uploaded:", response.data);
  return response.data.id; // photo_id
}

/**
 * Create or schedule a post with text + image
 */
async function createPost(message, photoId, scheduledTime) {
  const url = `https://graph.facebook.com/${PAGE_ID}/feed`;

  const payload = {
    message,
    attached_media: [{ media_fbid: photoId }],
    access_token: ACCESS_TOKEN,
  };

  // Schedule post if time is provided
  if (scheduledTime) {
    payload.published = true;
    payload.scheduled_publish_time = scheduledTime; // UNIX timestamp
  }

  const response = await axios.post(url, payload);
  console.log("✅ Post created:", response.data);

  return response.data.id; // post_id
}

/**
 * Add a comment to a post
 */
async function addComment(postId, comment) {
  const url = `https://graph.facebook.com/${postId}/comments`;

  const payload = {
    message: comment,
    access_token: ACCESS_TOKEN,
  };

  const response = await axios.post(url, payload);
  console.log("💬 Comment added:", response.data);
}

/**
 * Example usage
 */
async function main() {
  console.log(articles[0]);
  return;
  try {
    // 1️⃣ Upload the image first
    const imageUrl = "../photocards/prothomalo-photocard-skia/1.png"; // Replace with your image URL
    const photoId = await uploadImage(imageUrl);
    console.log({ photoId });
    // 2️⃣ Prepare message with hashtags

    const message = `${articles[0].title}
    বিস্তারিত কমেন্টে`;

    // 3️⃣ Schedule post (optional)
    // For immediate post, set scheduledTime = null
    const scheduledTime = Math.floor(Date.now() / 1000) + 60 * 10;
    const postId = await createPost(message, photoId);

    // 4️⃣ Add comment immediately after post creation
    const comment = `${articles[0].article_body} || ${articles[0].url} `;
    await addComment(postId, comment);
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }
}

main();
