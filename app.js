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

const returnFollowingUserId = (obj) => {
  return obj.following_user_id;
};

const isUserFollowingOrNot = async (request, response, next) => {
  const { username } = request;
  const { tweetId } = request.params;
  //console.log(username);
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(getUserQuery);
  const userIdOfUser = userDetails.user_id;

  const getTweetDetailsQuery = `
    SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`;
  const userIdObject = await db.get(getTweetDetailsQuery);
  const userId = userIdObject.user_id;

  const getFollowingUserIdsQuery = `
  SELECT following_user_id 
  FROM follower 
  WHERE follower_user_id = ${userIdOfUser};`;
  const followingUserIdsArray = await db.all(getFollowingUserIdsQuery);

  const listOfFollowingUserIds = [];
  for (let eachObject of followingUserIdsArray) {
    listOfFollowingUserIds.push(returnFollowingUserId(eachObject));
  }

  if (listOfFollowingUserIds.includes(userId) === true) {
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
    return;
  }
};

//Get User Followers API 5
app.get("/user/followers/", authenticateUser, async (request, response) => {
  const { username } = request;
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(getUserQuery);
  const userId = userDetails.user_id;
  const getFollowerUserIdsQuery = `
  SELECT name FROM user
  WHERE user_id IN (
    SELECT follower_user_id
    FROM follower WHERE following_user_id = ${userId});`;
  const followersArray = await db.all(getFollowerUserIdsQuery);
  response.send(followersArray);
});

//Get Tweet API 6
app.get(
  "/tweets/:tweetId/",
  authenticateUser,
  isUserFollowingOrNot,
  async (request, response) => {
    const { tweetId } = request.params;
    const getResultQuery = `
    SELECT tweet.tweet AS tweet,
    COUNT(DISTINCT like.like_id) AS likes,
    COUNT(DISTINCT reply.reply_id) AS replies,
    tweet.date_time AS dateTime
    FROM
    (tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id) AS T
    LEFT JOIN reply ON T.tweet_id = reply.tweet_id
    WHERE tweet.tweet_id = ${tweetId}
    GROUP BY tweet.tweet_id;`;
    const result = await db.get(getResultQuery);
    response.send(result);
  }
);

const getListOfUsers = (usersArray) => {
  const listOfUsers = [];
  for (let eachObj of usersArray) {
    listOfUsers.push(eachObj.username);
  }
  return listOfUsers;
};

//Get Liked Users API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateUser,
  isUserFollowingOrNot,
  async (request, response) => {
    const { tweetId } = request.params;
    const getUsersLikedQuery = `
    SELECT username
    FROM user
    WHERE user_id IN(
        SELECT user_id
        FROM like
        WHERE tweet_id = ${tweetId}
    );`;
    const usersArray = await db.all(getUsersLikedQuery);
    const listOfUsers = getListOfUsers(usersArray);
    response.send({ likes: listOfUsers });
  }
);

//Get User Replies API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateUser,
  isUserFollowingOrNot,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `
    SELECT name, reply
    FROM user INNER JOIN reply
    ON user.user_id = reply.user_id
    WHERE tweet_id = ${tweetId};`;
    const usersReplyArray = await db.all(getRepliesQuery);
    response.send({ replies: usersReplyArray });
  }
);

//Get User Tweets API 9
app.get("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const getUserDetails = `
    SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(getUserDetails);
  const userId = userDetails.user_id;

  const getUserTweetQuery = `
      SELECT tweet, COUNT(DISTINCT like.like_id) AS likes, COUNT(DISTINCT reply.reply_id) AS replies, tweet.date_time AS dateTime
      FROM (tweet LEFT JOIN like 
        ON
        tweet.tweet_id = like.tweet_id)
        AS T LEFT JOIN reply 
        ON
        T.tweet_id = reply.tweet_id 
      WHERE tweet.user_id = ${userId} 
      GROUP BY tweet.tweet_id;`;
  const res = await db.all(getUserTweetQuery);
  response.send(res);
});

//Add Tweet API 10
app.post("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const getUserDetails = `
    SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(getUserDetails);
  const userId = userDetails.user_id;
  const addTweetQuery = `
  INSERT INTO
  tweet (
      tweet, user_id
  )VALUES (
      '${tweet}', ${userId}
  );`;
  const res = await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

const getTweetIdsList = (eachObj) => {
  return eachObj.tweet_id;
};

const isThisUserTweetOrNot = async (request, response, next) => {
  const { username } = request;
  const { tweetId } = request.params;

  const getTweetIdQuery = `
    SELECT tweet_id FROM tweet WHERE tweet_id = ${tweetId};`;
  const getUserTweetId = await db.get(getTweetIdQuery);
  const userTweetId = getUserTweetId.tweet_id;

  const getUserDetails = `
      SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await db.get(getUserDetails);
  const userId = userDetails.user_id;
  const getTweetsQuery = `
    SELECT tweet_id FROM tweet WHERE user_id = ${userId};`;
  const arrayOfTweets = await db.all(getTweetsQuery);
  listOfTweetIds = [];
  for (let eachObj of arrayOfTweets) {
    listOfTweetIds.push(getTweetIdsList(eachObj));
  }

  if (listOfTweetIds.includes(userTweetId) === true) {
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
    return;
  }
};

//Delete Tweet API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateUser,
  isThisUserTweetOrNot,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const deleteTweetQuery = `
    DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
);

module.exports = app;
