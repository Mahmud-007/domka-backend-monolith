import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
import FormData from "form-data";

dotenv.config();

const PAGE_ID = process.env.PAGE_ID; // must be a Page ID
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; // must be a PAGE access token

if (!PAGE_ID || !ACCESS_TOKEN) {
  throw new Error("⚠️ Missing PAGE_ID or ACCESS_TOKEN in .env");
}

// ---- helpers --------------------------------------------------------

/**
 * Upload a local file as an UNPUBLISHED photo and return its media_fbid
 * Use this when you plan to create the feed post (immediate or scheduled) via /feed.
 */
async function uploadUnpublishedPhoto(localPath) {
  const form = new FormData();
  form.append("source", fs.createReadStream(localPath));
  form.append("published", "false"); // IMPORTANT
  form.append("access_token", ACCESS_TOKEN);

  const res = await axios.post(
    `https://graph.facebook.com/v24.0/${PAGE_ID}/photos`,
    form,
    { headers: form.getHeaders() }
  );
  // res.data.id is the media_fbid
  return res.data.id;
}

/**
 * Create a feed post that attaches one or more previously uploaded (unpublished) photos.
 * If scheduledTime is provided (unix seconds), the post will be scheduled.
 */
async function createFeedPostWithMedia({
  message,
  mediaFbids = [],
  scheduledTime = null,
}) {
  const form = new FormData();
  form.append("message", message);
  form.append("access_token", ACCESS_TOKEN);

  // attached_media must be indexed fields with JSON string values
  mediaFbids.forEach((fbid, i) => {
    form.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: fbid }));
  });

  if (scheduledTime) {
    form.append("published", "false");
    form.append("scheduled_publish_time", String(scheduledTime)); // >= now+600s
  }

  const res = await axios.post(
    `https://graph.facebook.com/v24.0/${PAGE_ID}/feed`,
    form,
    { headers: form.getHeaders() }
  );
  return res.data.id; // post_id
}

/**
 * EASIEST path for an immediate single-photo post:
 * Upload as PUBLISHED with a caption — this ALREADY creates the feed post.
 * Do NOT call /feed afterwards for the same image.
 */
async function postSinglePhotoNow({ localPath, caption }) {
  const form = new FormData();
  form.append("source", fs.createReadStream(localPath));
  form.append("caption", caption);
  // default published=true when omitted
  form.append("access_token", ACCESS_TOKEN);

  const res = await axios.post(
    `https://graph.facebook.com/v24.0/${PAGE_ID}/photos`,
    form,
    { headers: form.getHeaders() }
  );
  // res.data has { id (photo_id), post_id }
  return res.data.post_id;
}

async function addComment(postId, message) {
  const res = await axios.post(
    `https://graph.facebook.com/v24.0/${postId}/comments`,
    { message, access_token: ACCESS_TOKEN }
  );
  return res.data.id; // comment_id
}

// ---- main example ---------------------------------------------------

async function main() {
  // Load your article data
  const data = fs.readFileSync("../articles/article_filtered-2.json", "utf-8");
  const articles = JSON.parse(data);

  const localImagePath = "../photocards/photocard-skia/3.png";
  const caption = `${articles[2].caption}\nবিস্তারিত কমেন্টে`;

  // OPTION A: Immediate single-photo post (one call)
  // -----------------------------------------------
  // const postId = await postSinglePhotoNow({ localPath: localImagePath, caption });
  // console.log("✅ Posted (single photo):", postId);
  // await addComment(postId, `${articles[1].url} || ${articles[2].article_body.slice(0, 111)}`);

  // OPTION B: Schedule (or multi-photo) via /feed (two calls)
  // ---------------------------------------------------------
  try {
    // 1) Upload as UNPUBLISHED
    const mediaFbid = await uploadUnpublishedPhoto(localImagePath);
    console.log("✅ Unpublished photo uploaded:", mediaFbid);

    // 2) Create the feed post (scheduled or immediate)
    //    - To schedule: must be >= now + 600s
    let scheduledTime;
    // scheduledTime = Math.floor(Date.now() / 1000) + 60 * 10; // 10 mins later
    const postId = await createFeedPostWithMedia({
      message: caption,
      mediaFbids: [mediaFbid],
      scheduledTime, // set to null for immediate publish via /feed
    });
    console.log("✅ Feed post created:", postId);

    // 3) If immediate publish (scheduledTime=null), you can add a comment right away.
    //    If scheduled, you may want to queue a separate job to comment after it goes live.
    if (!scheduledTime) {
      await addComment(
        postId,
        `${articles[2].url} || ${articles[2].article_body.slice(0, 111)}`
      );
      console.log("💬 Comment added");
    } else {
      console.log("⏰ Post is scheduled; comment later when it’s live.");
    }
  } catch (err) {
    const e = err?.response?.data || err;
    // Gracefully handle duplicate re-post attempts
    if (e?.error?.error_subcode === 1366051) {
      console.log("➡️ Already posted. Skipping duplicate.");
    } else {
      console.error("❌ Error:", e);
    }
  }
}

main();
