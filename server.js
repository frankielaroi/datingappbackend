const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const session = require("express-session");
const { Server } = require("socket.io");
const websocket = require("./routes/websocket");
const populateAlgolia = require("./utils/populate");
const passport = require("./controllers/passport")

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

const PORT = process.env.PORT || 4001;
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
    populateAlgolia();
  })
  .catch((err) => console.error("MongoDB connection error:", err));
} else {
  console.error("MongoDB connection URI is not defined in the environment variables.");
}

const routes = [
  require("./routes/AuthRoutes"),
  require("./routes/UserRoutes"),
  require("./routes/resetRoutes"),
  require("./routes/matchingRoutes"),
  require("./routes/searchRoutes"),
  require("./routes/postRoutes"),
  require("./routes/postInteraction"),
  require("./routes/messagesRoutes"),
  require("./routes/conversationRoutes"),
  require("./routes/googleRoutes")
];

routes.forEach(route => app.use(route));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

websocket(io);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
