const express = require("express");
const crypto = require("crypto");
const User = require("../models/usermodel");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");

const router = express.Router();

// Route to handle password reset request
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
user.resetPasswordToken = resetToken;
user.resetPasswordExpires = Date.now() + 3600000; // Token expires in 1 hour
await user.save();

    const mailSender = process.env.MAIL_SENDER;
    const mailPassword = process.env.MAIL_PASSWORD;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: mailSender,
        pass: mailPassword,
      },
    });

    const mailOptions = {
      from: mailSender,
      to: email,
      subject: "Password Reset Request",
      text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\nPlease click on the following link to reset your password:\n\nhttp://${req.headers.host}/reset-password/${resetToken}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Password reset email sent" });
    console.log(resetToken)
  } catch (error) {
    console.error("Error in forgot password:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Route to handle password reset
router.post("/reset-password/", async (req, res) => {
  const { resetToken } = req.query;
  const { newPassword } = req.body;

  try {
    const user = await User.findOne({
      resetPasswordToken: resetToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Error in password reset:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
