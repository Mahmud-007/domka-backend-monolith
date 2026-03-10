import express from "express";
import axios from "axios";
import qs from "qs";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_REDIRECT_URI = process.env.FB_REDIRECT_URI; // must match portal exactly
console.log(FB_APP_ID, FB_APP_SECRET, FB_REDIRECT_URI);

// Step A: Frontend sends users here or builds URL client-side
app.get("/auth/facebook", (req, res) => {
  console.log(FB_APP_ID, FB_APP_SECRET, FB_REDIRECT_URI);
  const params = qs.stringify({
    client_id: FB_APP_ID,
    redirect_uri: FB_REDIRECT_URI,
    scope: [
      "public_profile",
      "email",
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
    ].join(","),
    response_type: "code",
    auth_type: "rerequest",
  });
  res.redirect(`https://www.facebook.com/v20.0/dialog/oauth?${params}`);
});

// Step B: OAuth redirect handler
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;

  // 1) Exchange code → short-lived user token
  const tokenResp = await axios.get(
    "https://graph.facebook.com/v20.0/oauth/access_token",
    {
      params: {
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        redirect_uri: FB_REDIRECT_URI,
        code,
      },
    }
  );
  const shortUserToken = tokenResp.data.access_token;

  // 2) Exchange short → long-lived user token
  const longUserResp = await axios.get(
    "https://graph.facebook.com/v20.0/oauth/access_token",
    {
      params: {
        grant_type: "fb_exchange_token",
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        fb_exchange_token: shortUserToken,
      },
    }
  );
  const longUserToken = longUserResp.data.access_token;

  // 3) Get Pages + Page tokens
  const pages = await axios.get(
    "https://graph.facebook.com/v20.0/me/accounts",
    {
      params: { access_token: longUserToken },
    }
  );

  // Persist longUserToken and selected page {id, access_token} securely (encrypted at rest).
  // For demo: pick first page
  const page = pages.data.data?.[0];
  // saveToDB({ longUserToken, pageId: page.id, pageToken: page.access_token })

  res.json({ ok: true, page });
});

// Step C: Publish to the Page feed (text/link)
app.post("/post", async (req, res) => {
  const { message, link } = req.body;
  const { pageId, pageToken } = await loadFromDB(); // your own storage

  const resp = await axios.post(
    `https://graph.facebook.com/v20.0/${pageId}/feed`,
    qs.stringify({ message, link }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      params: { access_token: pageToken },
    }
  );

  res.json(resp.data); // returns post id
});

app.listen(3000);
