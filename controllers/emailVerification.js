const nodemailer = require("nodemailer");

// Function to send email verification message
async function sendEmailVerification(email, emailVerificationToken) {
  const mailSender = process.env.MAIL_SENDER;
  const mailPassword = process.env.MAIL_PASSWORD;
  try {
    // Create a Nodemailer transporter using SMTP transport
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: mailSender,
        pass: mailPassword,
      },
    });

    // Placeholder URL for verification link
    const verificationLink = "http://localhost:4001"; // Update with your actual URL later

    // Email content and options
    const mailOptions = {
      from: mailSender, // Sender address
      to: email, // Recipient address
      subject: "Email Verification", // Email subject
      html: `
        <p>Hello,</p>
        <p>Thank you for registering with Dating App. Please click the link below to verify your email:</p>
        <p><a href="${verificationLink}/api/verify-email?token=${emailVerificationToken}">Verify Email</a></p>
        <p>If you did not sign up for Dating App, please ignore this email.</p>
      `,
    };

    // Send the email using the transporter
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send verification email");
  }
}

module.exports = sendEmailVerification;
