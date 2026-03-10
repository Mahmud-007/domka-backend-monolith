const JWT = require("google-auth-library");

const jwt = new JWT({
  email: "firebase-adminsdk-fbsvc@footylight-app.iam.gserviceaccount.com",
  key: "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC1EZXYnqnowOcN\nLJLF7iqlz92XPW6sTIsc/e7AFa7J3pXN0PHC8VHPomobhf7pWYF1m5o1U0vAmFXJ\nsqceNvKcWOPEH3cgXL6gHJWgnucY75b+oTa22Q7xeCpThdSQ+qXO5jQJkOlwOxH3\nOd39gNJcZpX+KmAMh5wbMXbkTEkSEO8MHfJVtl4zytzkRCrDXChJPYc88abcBeIx\nrIj/+CFCxRWcR1ixE+xkWmmpFT8OR1uCj9C8Bb32vx7tJ0JCScq2X11pbddpBxkB\n5VjFKoBspVILaUPrVbyGXHTylAxJxsH2q4Ms6ZwV8tCKyr4DfktnsnN/nFUJi/NK\nUd/u17orAgMBAAECggEAFIBvu43HhkOlRbAY1FFxwcGGARRjHh4ymC9GY7hwyImr\n45h3b0+8qCpnIkOrR8erKWJbdRM/3ghBmmtgkcK9+Kb17yRy7BakPOPPq1aiqweh\nzKX7WHu+PegRvtBF7755nLIjDTw7uknt8FS8hnIaH308GYG5y2FlcwzIPfRHR8Sz\nUXp7cG+INUtBtGARmssOn5ujOhftvOjVpo5jwqg0LR9y8adxOXG+ywAD8bRDXXz5\nUx6ZzGizVB2VinxKgzX0wnbMCChZmdn+E7Sx1T7e3+eM3ojG46/j9BRP6Htc6vmU\nqMZPnfUPdyMZfhyvaeg6hsSn3RG+XFnZN3FbrJyG/QKBgQDao//p0xvv4lXNgSdV\nn0nlW8t1Qu4zndh2TbiRRnoxk1ql87zdevws+p/p9ujCAsfmS+rxpPXTBKIA0UOD\nJ0leF9nox04UQbJOtQM1TRCAcL+ytJSChX6VVUl6JrGTsvm7skc8o7x5lPI29Uy7\nCk0dOmMMHe0FS+Vmq5uw9UC9BQKBgQDUAhN6uNYyDe04YntyZGgLz0RmMrCkHcfE\nm8Ms1Y7hi+3gCQ5OZqa0Fr9qtoffvOonDX1AjKtctm72DZzitVnzRYvfX/WCZFtU\njF6TP3+3VjfOkL/48UadVase7Iu+dIaxj06u0S/Yer0QSayrsAydG9SDhmfDTy1w\nKlxyj0HBbwKBgGEgA1oizsFEgSs2WXves9vwaDRiFCDX2MXNBtV6QmPtepJH8TlO\nHeH5P7qWVZWB2L1EMk1AI3enEjRcwansdNoYrFOM3fF/sa7nGFLANjloXLANKf/F\nP5Mk/OwHblEXa3rm2mBkuCAme2bQl1JrZBA81K0YSidVLMXsK9BzUlvlAoGAdV0Q\n24cnTF5ZTDV4kUL0NlVvUAQPtUqnJDf2PAOdLU8BSFy7Brvc3SUaokCZx0oVdbkJ\n9Ynp81Eq7BttFjO+r+V4IRhGGQDlblCmqm0kjqG0Ey4el/k5Vi/uoxff5HcteW4T\n6ML08apAr5uZcxHqaa7WXlkxZ/WU+dr5gpG7nRECgYEA16DWwc6OsF9ppEqzfJDe\nsYog/0focuopqmv9hdcsMClSNnftlCzHkp2J+SgOuaz/3qQ22qvUuCqOjxDmdmFp\nUt1gPxDE9wqCL33vMJkm6heQ+icDYfKbPw0M/sSelLuYHf3KAjFXmglUomwkiC1F\nQxsz933+1jL+20ovVXEmfic=",
  scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
});

async function getAccessToken() {
  const client = await jwt.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

const accessToken =  getAccessToken();
console.log("ACCESS_TOKEN:", accessToken);
