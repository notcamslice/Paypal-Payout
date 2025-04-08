const paypalPayoutsSdk = require('@paypal/payouts-sdk');
const cron = require('node-cron');
const fs = require('fs').promises;
const pLimit = require('p-limit');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const retry = require('async-retry');
require('dotenv').config();

const MAX_RETRIES = process.env.MAX_RETRIES || 3;
const BACKOFF_MULTIPLIER = process.env.BACKOFF_MULTIPLIER || 2;

function PayPalClient() {
    const env = process.env.PAYPAL_MODE === 'live'
        ? new paypalPayoutsSdk.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET)
        : new paypalPayoutsSdk.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET);

    return new paypalPayoutsSdk.core.PayPalHttpClient(env);
}

if (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_PASSWORD && process.env.MYSQL_DATABASE) {
    pool = mysql.createPool({
        connectionLimit: 10,
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });
    console.log('Connected to MySQL database pool.');
} else {
    console.log('MySQL credentials not found. Falling back to file logging.');
}

const log = async (message, type = 'info') => {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${type.toUpperCase()}: ${message}\n`;
    try {
        await fs.appendFile('payout_logs.log', logMessage);
    } catch (err) {
        console.error('Error logging to file:', err);
    }
};

const executeQuery = async (query, values) => {
    try {
        const [rows] = await pool.execute(query, values);
        return rows;
    } catch (err) {
        console.error('Error executing query:', err);
        throw err;
    }
};

const logToDatabase = async (recipientEmail, amount, status, transactionId = null, errorMessage = null) => {
    if (!pool) return;
    const timestamp = new Date().toISOString();
    const query = `INSERT INTO payout_history (recipient_email, amount, status, transaction_id, error_message, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)`;
    const values = [recipientEmail, amount, status, transactionId, errorMessage, timestamp];
    await executeQuery(query, values);
};

const sendPayout = async (amount, recipientEmail = process.env.RECIPIENT_EMAIL) => {
    const client = PayPalClient();

    const requestBody = {
        sender_batch_header: {
            sender_batch_id: `batch_${uuidv4()}`,
            email_subject: "You have a payment",
            email_message: "You have received a payment from us!"
        },
        items: [
            {
                recipient_type: "EMAIL",
                amount: {
                    value: amount.toFixed(2),
                    currency: process.env.PAYOUT_CURRENCY || "USD"
                },
                note: "Automatic payout every 24 hours",
                sender_item_id: `item_${uuidv4()}`,
                receiver: recipientEmail
            }
        ]
    };

    const request = new paypalPayoutsSdk.payouts.PayoutsPostRequest();
    request.requestBody(requestBody);

    try {
        const response = await client.execute(request);
        const batchId = response.result.batch_header.payout_batch_id;

        await logToDatabase(recipientEmail, amount, "success", batchId);
        await log(`Payout successful: ${JSON.stringify(response.result)}`);
    } catch (error) {
        await logToDatabase(recipientEmail, amount, "failed", null, error.message);
        await log(`Payout failed: ${error.message}`, 'error');
        throw error;
    }
};

const sendPayoutWithRetry = async (amount, recipientEmail) => {
    await retry(async () => {
        await sendPayout(amount, recipientEmail);
    }, {
        retries: MAX_RETRIES,
        factor: BACKOFF_MULTIPLIER,
        onRetry: (error, attempt) => {
            console.log(`Retry attempt #${attempt} after error: ${error.message}`);
        }
    });
};

const limit = pLimit(1);
const queuePayout = (amount) => {
    limit(() => sendPayoutWithRetry(amount))
        .then(() => console.log("Payout completed successfully"))
        .catch((error) => log(`Payout failed after all retries: ${error.message}`, 'error'));
};

const getPayPalBalance = () => {
    return 150.00;
}

const MINIMUM_BALANCE = 20.00;

const checkBalanceAndSendPayout = () => {
    const balance = getPayPalBalance();
    if (balance > MINIMUM_BALANCE) {
        const amountToSend = balance - MINIMUM_BALANCE;
        console.log(`Balance is sufficient, sending ${amountToSend} to recipient.`);
        queuePayout(amountToSend);
    } else {
        console.log(`Balance too low. Current balance: $${balance}. Minimum required: $${MINIMUM_BALANCE}.`);
    }
};

cron.schedule('0 0 * * *', () => {
    console.log("Running scheduled payout check...");
    checkBalanceAndSendPayout();
});
