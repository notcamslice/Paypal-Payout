# PayPal Automatic Payout System

A Node.js-based system designed to automatically send the maximum available balance from a PayPal account to a specified recipient every 24 hours. This project includes advanced error handling, retry mechanisms, rate limiting, transaction logging, and a minimum balance check for secure payouts.

## Features

- **Automatic PayPal Payout**: Sends the maximum available balance to a recipient daily.
- **Error Handling**: Implements retries with exponential backoff on payout failures.
- **Rate Limiting**: Ensures API requests respect PayPal rate limits.
- **Minimum Balance Check**: Prevents the balance from dropping below a specified threshold.
- **Transaction Logging**: Logs all successful and failed payouts to a log file or database.

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/NotCamSlice/Paypal-Payout.git
    cd paypal-payout
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Set up environment variables:
    - Create a `.env` file in the project root with your PayPal API credentials:
    ```bash
    PAYPAL_CLIENT_ID=your_paypal_client_id
    PAYPAL_CLIENT_SECRET=your_paypal_client_secret
    PAYPAL_MODE=sandbox  # Change to 'live' in production
    MYSQL_HOST=mysql_host
    MYSQL_USER=mysql_user
    MYSQL_PASSWORD=mysql_password
    MYSQL_DATABASE=database_name
    RECIPIENT_EMAIL=recipient@example.com
    MAX_RETRIES=3
    BACKOFF_MULTIPLIER=2
    ```

4. (Optional) Set up your MySQL database for transaction logging:
    - Run the following SQL command to create the `payout_history` table:
    ```sql
    CREATE TABLE payout_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        recipient_email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) NOT NULL,
        transaction_id VARCHAR(100) DEFAULT NULL,
        error_message TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ```

## Usage

1. Start the system:
    ```bash
    npm start
    ```

2. The system will automatically:
    - Check the PayPal balance every 24 hours.
    - Send the available balance minus the minimum threshold (configured in the code) to the recipient.
    - Retry up to 3 times if a payout fails.
    - Log transactions to the database or log files.

## Configuration

- **Payout Recipient**: The recipient email and amount are hardcoded in the `sendPayout()` function. Modify this as needed.
- **Rate Limiting**: Uses `p-limit` to limit payouts to 1 request every 5 seconds. You can adjust this in the code if needed.
- **Minimum Balance**: The minimum balance is configured in the code as a constant (`MINIMUM_BALANCE`). Adjust this value to suit your needs.

## Dependencies

- [Node.js](https://nodejs.org/)
- [PayPal REST SDK](https://www.npmjs.com/package/paypal-rest-sdk)
- [node-cron](https://www.npmjs.com/package/node-cron)
- [p-limit](https://www.npmjs.com/package/p-limit)
- [dotenv](https://www.npmjs.com/package/dotenv)

## Contributing

If you'd like to contribute to this project, feel free to submit a pull request or open an issue to suggest improvements or report bugs.

---

### Contact

For any questions or issues, feel free to reach out to:

- **Author**: notcamslice
- **Email**: [cam@jaracc.com](mailto:cam@jaracc.com)
