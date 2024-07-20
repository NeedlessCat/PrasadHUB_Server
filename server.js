require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const { createHmac } = require("crypto");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const cors = require("cors");

const clientId = process.env.ClientID;
const clientSecret = process.env.ClientSecret;
const refreshToken = process.env.RefreshToken;
const userEmail = process.env.UserEmail;

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: ["https://prasad-hub-client.vercel.app"],
    // origin: ["http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
const OAuth2 = google.auth.OAuth2;
const OAuth2_client = new OAuth2(clientId, clientSecret);
OAuth2_client.setCredentials({ refresh_token: refreshToken });

const accessToken = OAuth2_client.getAccessToken();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    type: "OAuth2",
    user: userEmail,
    clientId: clientId,
    clientSecret: clientSecret,
    refreshToken: refreshToken,
    accessToken: accessToken,
  },
});

async function sendReceiptEmail(email, paymentDetails) {
  const mailOptions = {
    from: `PrasadHUB <${userEmail}>`,
    to: email,
    subject: "Payment Receipt - PrasadHUB",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4a4a4a;">Payment Receipt</h1>
        <p>Dear valued donor,</p>
        <p>Thank you for your generous donation to PrasadHUB. Your support is greatly appreciated.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Payment ID:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${
              paymentDetails.razorpay_payment_id
            }</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Order ID:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${
              paymentDetails.razorpay_order_id
            }</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">₹${
              paymentDetails.amount
            }</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">₹${
              paymentDetails.name
            }</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">₹${
              paymentDetails.mobile
            }</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">₹${
              paymentDetails.role
            }</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd;"><strong>Date:</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${new Date().toLocaleString()}</td>
          </tr>
        </table>
        <p style="margin-top: 20px;">If you have any questions, please don't hesitate to contact us.</p>
        <p>Best regards,<br>PrasadHUB Team</p>
      </div>
    `,
  };
  console.log("MailOptions before try : ", mailOptions);

  try {
    console.log("mailoptions", mailOptions);
    await transporter.sendMail(mailOptions);
    console.log("Receipt email sent successfully");
  } catch (error) {
    console.error("Error sending receipt email:", error);
    // throw error; // Rethrow the error to be handled in the calling function
  }
}

app.get("/", (req, res) => {
  res.send("Server is running");
});
app.post("/create-razorpay-order", async (req, res) => {
  try {
    const options = {
      amount: req.body.amount,
      currency: req.body.currency,
      receipt: req.body.receipt,
      payment_capture: 1, // Auto capture
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.post("/verify-payment", async (req, res) => {
  // console.log("Verification under work...");
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;
  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSign = createHmac("sha256", "1LKBMcLN8geqlLou3Bi0jMf8")
    .update(sign.toString())
    .digest("hex");

  if (razorpay_signature === expectedSign) {
    // Fetch order details from Razorpay
    try {
      const order = await razorpay.orders.fetch(razorpay_order_id);

      // Send receipt email
      await sendReceiptEmail(req.body.email, {
        razorpay_payment_id,
        razorpay_order_id,
        amount: order.amount / 100, // Convert from paise to rupees
        name: req.body.name,
        mobile: req.body.mobile,
        role: req.body.role,
      });
      res.json({ verified: true });
    } catch (error) {
      console.error("Error fetching order or sending email:", error);
      res.status(500).json({ verified: true, emailSent: false });
    }
  } else {
    res.status(400).json({ verified: false });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
