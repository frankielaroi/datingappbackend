import express from "express";
import crypto from "crypto";
import User from "../models/usermodel";
import nodemailer from "nodemailer";
import { hashPassword, hashToken, isAcceptablePassword, MIN_PASSWORD_LENGTH } from "../utils/password";
import { passwordResetLimiter } from "../utils/rateLimit";

const router = express.Router();

// Route to handle password reset request
router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  const { email } = req.body;

  try {
    const genericReply = { message: "If that email is registered, a reset code has been sent" };
    if (typeof email !== "string") {
      return res.status(400).json({ message: "Email is required" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    // Only the hash is stored. updateOne (not save) so the Algolia hook doesn't
    // overwrite the search record with this partial document.
    const result = await User.updateOne(
      { email: email.trim().toLowerCase() },
      { $set: { resetPasswordToken: hashToken(resetToken), resetPasswordExpires: new Date(Date.now() + 3600000) } }
    );
    if (result.matchedCount === 0) {
      return res.status(200).json(genericReply);
    }

    const mailSender = process.env.MAIL_SENDER;
    const mailPassword = process.env.MAIL_PASSWORD;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: mailSender,
        pass: mailPassword,
      },
    });

    const resetUrl = `http://${req.headers.host}/reset-password/${resetToken}`;
    const mailOptions = {
      from: mailSender,
      to: email,
      subject: "Password Reset Request",
      text: `<!Doctype HTML><html>
        <h1>Password Reset</h1>You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\nThis is Your Reset Password:\n\n${resetToken}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n</html>`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json(genericReply);
  } catch (error: any) {
    console.error("Error in forgot password:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Route to handle password reset
router.post("/reset-password/:resetToken", passwordResetLimiter, async (req, res) => {
  const { resetToken } = req.params;
  const { newPassword } = req.body;

  try {
    if (!isAcceptablePassword(newPassword)) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const result = await User.updateOne(
      { resetPasswordToken: hashToken(String(resetToken)), resetPasswordExpires: { $gt: new Date() } },
      {
        $set: { password: await hashPassword(newPassword) },
        $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    res.status(200).json({ message: "Password reset successful" });
  } catch (error: any) {
    console.error("Error in password reset:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;