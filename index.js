const paypal = require('paypal-rest-sdk');
const cron = require('node-cron');
const fs = require('fs');
const pLimit = require('p-limit');
const mysql = require('mysql');
require('dotenv').config();

paypal.configure({
    'mode': process.env.PAYPAL_MODE,
    'client_id': process.env.PAYPAL_CLIENT_ID,
    'client_secret': process.env.PAYPAL_CLIENT_SECRET
});

let dbConnection = null;

if (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_PASSWORD && process.env.MYSQL_DATABASE) {
    dbConnection = mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE
    });

    dbConnection.connect((err) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            dbConnection = null;
        } else {
            console.log('Connected to MySQL database.');
        }
    });
} else {
    console.log('MySQL credentials not found. Falling back to file logging.');
}

const logError = (error) => {
    const timestamp = new Date().toISOString();
    if (dbConnection) {
        const query = `INSERT INTO payout_history (recipient_email, amount, status, error_message, created_at)
                       VALUES (?, ?, ?, ?, ?)`;
        dbConnection.query(query, ["unknown", 0, "failed", error.message, timestamp], (err) => {
            if (err) console.error('Error logging to MySQL:', err);
        });
    } else {
        fs.appendFileSync('payout_errors.log', `${timestamp} - Error: ${error.message}\n`);
    }
};

const logSuccess = (payout, amount, recipientEmail) => {
    const timestamp = new Date().toISOString();
    if (dbConnection) {
        const query = `INSERT INTO payout_history (recipient_email, amount, status, transaction_id, created_at)
                       VALUES (?, ?, ?, ?, ?)`;
        dbConnection.query(query, [recipientEmail, amount, "success", payout.batch_header.payout_batch_id, timestamp], (err) => {
            if (err) console.error('Error logging to MySQL:', err);
        });
    } else {
        fs.appendFileSync('payout_success.log', `${timestamp} - Success: ${JSON.stringify(payout)}\n`);
    }
};

const handlePayoutError = (error, retryCount) => {
    logError(error);
    if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`Retrying payout in ${delay / 1000} seconds... Attempt ${retryCount + 1}`);
        
        setTimeout(() => {
            sendPayout(amount, retryCount + 1);
        }, delay);
        
        return true;
    }
    console.log("Payout failed after 3 attempts.");
    return false;
};

const sendPayout = (amount, recipientEmail, retryCount = 0) => {
    const payoutConfig = {
        "sender_batch_header": {
            "sender_batch_id": "batch_" + Math.random().toString(36).substring(9),
            "email_subject": "You have a payment",
            "email_message": "You have received a payment from us!"
        },
        "items": [
            {
                "recipient_type": "EMAIL",
                "amount": {
                    "value": amount,
                    "currency": "USD"
                },
                "receiver": recipientEmail,
                "note": "Automatic payout every 24 hours",
                "sender_item_id": "item_" + Math.random().toString(36).substring(9)
            }
        ]
    };

    paypal.payout.create(payoutConfig, function (error, payout) {
        if (error) {
            const shouldRetry = handlePayoutError(error, retryCount);
            if (shouldRetry) {
                sendPayout(amount, retryCount + 1);
            }
        } else {
            logSuccess(payout, amount, recipientEmail);
        }
    });
};

const limit = pLimit(1);
const queuePayout = (amount) => {
    limit(() => sendPayout(amount))
        .then(() => console.log("Payout completed successfully"))
        .catch((error) => logError(error));
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
    console.log("Running payout job at midnight...");
    checkBalanceAndSendPayout();
}, {
    timezone: "America/New_York"
});