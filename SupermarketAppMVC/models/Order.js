const db = require('../db');

const Order = {
    getOrdersWithItemsByUser(userId, callback) {
        const ordersSql = `
          SELECT id, order_number, total, placed_at
          FROM orders
          WHERE user_id = ?
          ORDER BY placed_at DESC, id DESC
        `;
        db.query(ordersSql, [userId], (orderErr, orders) => {
            if (orderErr || !orders || orders.length === 0) return callback(orderErr, orders || [], {});
            const orderIds = orders.map(o => o.id);
            const itemsSql = `
              SELECT oi.*, p.image
              FROM order_items oi
              LEFT JOIN products p ON p.id = oi.product_id
              WHERE oi.order_id IN (?)
            `;
            db.query(itemsSql, [orderIds], (itemsErr, items) => {
                if (itemsErr) return callback(itemsErr);
                const itemsByOrder = {};
                (items || []).forEach(it => {
                    if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
                    itemsByOrder[it.order_id].push(it);
                });
                callback(null, orders, itemsByOrder);
            });
        });
    },

    createOrder(userId, orderNumber, cartItems, total, callback) {
        db.beginTransaction((err) => {
            if (err) return callback(err);

            const adjustStock = (index) => {
                if (index >= cartItems.length) return insertOrder();
                const item = cartItems[index];
                if (!item.id) return adjustStock(index + 1);

                const lockSql = 'SELECT quantity FROM products WHERE id = ? FOR UPDATE';
                db.query(lockSql, [item.id], (lockErr, rows) => {
                    if (lockErr) return db.rollback(() => callback(lockErr));
                    if (!rows || rows.length === 0) {
                        const notFoundErr = Object.assign(new Error('Product not found'), { code: 'PRODUCT_NOT_FOUND' });
                        return db.rollback(() => callback(notFoundErr));
                    }
                    const available = rows[0].quantity;
                    if (available < item.quantity) {
                        const stockErr = Object.assign(new Error('Insufficient stock'), { code: 'INSUFFICIENT_STOCK' });
                        return db.rollback(() => callback(stockErr));
                    }
                    const updateSql = 'UPDATE products SET quantity = quantity - ? WHERE id = ?';
                    db.query(updateSql, [item.quantity, item.id], (updateErr) => {
                        if (updateErr) return db.rollback(() => callback(updateErr));
                        adjustStock(index + 1);
                    });
                });
            };

            const insertOrder = () => {
                const orderSql = 'INSERT INTO orders (order_number, user_id, total) VALUES (?, ?, ?)';
                db.query(orderSql, [orderNumber, userId, total], (orderErr, orderResult) => {
                    if (orderErr) return db.rollback(() => callback(orderErr));

                    const orderId = orderResult.insertId;
                    const itemValues = cartItems.map(it => [
                        orderId,
                        it.id || null,
                        it.productName,
                        it.price,
                        it.quantity
                    ]);

                    const itemsSql = `
                      INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
                      VALUES ?
                    `;
                    db.query(itemsSql, [itemValues], (itemsErr) => {
                        if (itemsErr) return db.rollback(() => callback(itemsErr));
                        db.commit((commitErr) => {
                            if (commitErr) return db.rollback(() => callback(commitErr));
                            callback(null, { orderId, orderNumber });
                        });
                    });
                });
            };

            adjustStock(0);
        });
    }
};

module.exports = Order;
