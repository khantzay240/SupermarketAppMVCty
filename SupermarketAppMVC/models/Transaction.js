const util = require('util');
const db = require('../db');

// Wrap mysql2's callback query method so Transaction.create can be awaited
const query = util.promisify(db.query).bind(db);

const Transaction = {
  create: async (data) => {
    const sql = `INSERT INTO transactions (orderId, payerId, payerEmail, amount, currency, status, time)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      data.orderId,
      data.payerId,
      data.payerEmail,
      data.amount,
      data.currency,
      data.status,
      data.time
    ];
    await query(sql, params);
  }
};

module.exports = Transaction;
