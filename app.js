const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const dbPath = path.join(__dirname, "twitterClone.db");

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3005, () =>
      console.log("Server Running at http://localhost:3005/")
    );
  } catch (e) {
    console.lolg(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const checkRegisteringUserDetails = async (request, response, next) => {
  const { username, password, name, gender } = request.body;
  let userDetails;
  const getUserQuery = `
    SELECT *
    FROM
    user
    WHERE
    username = '${username}';`;
  userDetails = await db.get(getUserQuery);
  if (userDetails !== undefined) {
    if (userDetails.username === username) {
      response.status(400);
      response.send("User already exists");
    }
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    request.username = username;
    request.password = password;
    request.name = name;
    request.gender = gender;
    next();
  }
};

const checkLoggingUserDetails = async (request, response, next) => {
  const { username, password } = request.body;
  let userDetails;
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  userDetails = await db.get(getUserQuery);
  if (userDetails !== undefined) {
    const isValidPassword = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isValidPassword === true) {
      request.username = username;
      request.password = password;
      next();
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
};

const authenticateUser = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "baluabcdefg", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//Register New User API 1
app.post(
  "/register/",
  checkRegisteringUserDetails,
  async (request, response) => {
    const { username, password, name, gender } = request;
    const hashedPassword = await bcrypt.hash(password, 10);
    const addUserQuery = `
    INSERT INTO
    user(name, username, password, gender)
    VALUES('${name}', '${username}', '${hashedPassword}', '${gender}');`;
    await db.run(addUserQuery);
    response.status(200);
    response.send("User created successfully");
  }
);

//Login User API 2
app.post("/login/", checkLoggingUserDetails, async (request, response) => {
  const { username, password } = request;
  const payload = { username: username };
  const jwtToken = jwt.sign(payload, "baluabcdefg");
  response.send({ jwtToken });
});

//Get Tweets API 3
app.get("/user/tweets/feed/", authenticateUser, async (request, response) => {
  const { username } = request;
  const getUserQuery = `
  SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(getUserQuery);
  const userId = userDetails.user_id;
  const getTweetsQuery = `
  SELECT username, tweet, date_time AS dateTime FROM
  user INNER JOIN tweet ON user.user_id = tweet.user_id
  WHERE user.user_id IN 
  (SELECT following_user_id FROM follower WHERE follower_user_id = ${userId})
  ORDER BY date_time DESC
  LIMIT 4;`;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray);
});

//Get Following Users API 4
app.get("/user/following/", authenticateUser, async (request, response) => {
  const { username } = request;
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(getUserQuery);
  const userId = userDetails.user_id;
  const getFollowingUsersQuery = `
  SELECT name FROM user WHERE user_id IN
  (SELECT following_user_id FROM follower WHERE follower_user_id = ${userId});`;
  const followingUsersArray = await db.all(getFollowingUsersQuery);
  response.send(followingUsersArray);
});

//Get Tweet API 5
app.get("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(getUserQuery);
  const getTweetDetails = `
  SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`;
  const userId = userDetails.user_id;
  const followingUsersArrayQuery = `
  SELECT following_user_id FROM follower
      WHERE follower_user_id = ${userId};`;
  const followingUserArray = await db.all(followingUsersArrayQuery);
  console.log(followingUserArray);
  //console.log(userId);
  const getResultQuery = `
  SELECT tweet.tweet AS tweet,
  COUNT(like.like_id) AS likes,
  COUNT(reply.reply_id) AS replies,
  tweet.date_time AS dateTime
  FROM
  (tweet INNER JOIN like ON tweet.user_id = like.user_id) AS T
  INNER JOIN reply ON T.user_id = reply.user_id
  WHERE tweet.user_id IN(
      SELECT following_user_id FROM follower
      WHERE follower_user_id = ${userId});`;
  const result = await db.all(getResultQuery);
  //console.log(result);
});

module.exports = app;
