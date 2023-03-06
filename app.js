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
        response.send("Invalid Jwt Token");
      } else {
        request.username = username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid Jwt Token");
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

//Get Tweets API
app.get(
  "/user/tweets/feed/",
  authenticateUser,
  async (request, response) => {}
);
