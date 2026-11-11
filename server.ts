import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import session from "express-session";
import { Server } from "socket.io";
import websocket from "./routes/websocket";
import populateAlgolia from "./utils/populate";
import passport from "./controllers/passport";
import AuthRoutesRouter from "./routes/AuthRoutes";
import UserRoutesRouter from "./routes/UserRoutes";
import resetRoutesRouter from "./routes/resetRoutes";
import matchingRoutesRouter from "./routes/matchingRoutes";
import searchRoutesRouter from "./routes/searchRoutes";
import postRoutesRouter from "./routes/postRoutes";
import postInteractionRouter from "./routes/postInteraction";
import messagesRoutesRouter from "./routes/messagesRoutes";
import conversationRoutesRouter from "./routes/conversationRoutes";
import googleRoutesRouter from "./routes/googleRoutes";

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
  mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    populateAlgolia();
  })
  .catch((err: any) => console.error("MongoDB connection error:", err));
} else {
  console.error("MongoDB connection URI is not defined in the environment variables.");
}

const routes = [
  AuthRoutesRouter,
  UserRoutesRouter,
  resetRoutesRouter,
  matchingRoutesRouter,
  searchRoutesRouter,
  postRoutesRouter,
  postInteractionRouter,
  messagesRoutesRouter,
  conversationRoutesRouter,
  googleRoutesRouter
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
