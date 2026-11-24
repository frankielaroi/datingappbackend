import crypto from "crypto";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/usermodel";

// Usernames must be unique; derive one from the email and add a short random
// suffix so two "ama@..." accounts don't collide.
function usernameFrom(email: string): string {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30) || "user";
  return `${base}${crypto.randomBytes(3).toString("hex")}`;
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();

        let user = await User.findOne({ googleId: profile.id });
        if (!user && email) {
          // Someone who registered with a password and now signs in with the
          // same Google email gets Google linked to their existing account.
          user = await User.findOneAndUpdate(
            { email },
            { $set: { googleId: profile.id }, $addToSet: { authProviders: { $each: ["password", "google"] } } },
            { new: true }
          );
        }
        if (!user) {
          if (!email) return done(new Error("Google account has no email address"));
          user = await User.create({
            googleId: profile.id,
            authProviders: ["google"],
            email,
            username: usernameFrom(email),
            firstName: profile.name?.givenName,
            lastName: profile.name?.familyName,
            displayName: profile.displayName,
            profilePicture: profile.photos?.[0]?.value,
            isEmailVerified: true,
          });
        }
        return done(null, user);
      } catch (error: any) {
        return done(error);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, (user as any).id);
});

passport.deserializeUser(async (id, done) => {
  try {
    done(null, await User.findById(id).select("_id username email"));
  } catch (error: any) {
    done(error);
  }
});

export default passport;
