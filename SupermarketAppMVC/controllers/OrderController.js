const nodemailer = require('nodemailer');
const Cart = require('../models/Cart');
const Order = require('../models/Order');

const smtpTransporter = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        } : undefined
    })
    : null;

const fetchCartItems = (req, callback) => {
    const user = req.session.user;
    if (user && user.id) {
        Cart.getItemsByUserId(user.id, (err, cartItems) => callback(err, cartItems || []));
    } else {
        callback(null, req.session.cart || []);
    }
};

const clearCart = (req, callback) => {
    const user = req.session.user;
    if (user && user.id) {
        Cart.clear(user.id, (err) => callback(err));
    } else {
        req.session.cart = [];
        callback(null);
    }
};

const sendReceiptEmail = async (user, cartItems, total, orderNumber) => {
    const lines = cartItems.map(it => {
        const price = parseFloat(it.price);
        return `${it.quantity} x ${it.productName} @ $${price.toFixed(2)}`;
    }).join('\n');
    const textBody = `Hi ${user.username},

Thank you for your order ${orderNumber}.

${lines}

Total: $${total.toFixed(2)}
`;

    if (!smtpTransporter) {
        console.log(`[EMAIL][SIMULATED] To: ${user.email}\nOrder ${orderNumber}\n${lines}\nTotal: $${total.toFixed(2)}`);
        return;
    }

    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const mailOptions = {
        from,
        to: user.email,
        subject: `Your receipt for order ${orderNumber}`,
        text: textBody
    };

    await smtpTransporter.sendMail(mailOptions);
};

const OrderController = {
    showCheckout(req, res) {
        const user = req.session.user;
        fetchCartItems(req, (err, cartItems) => {
            if (err) return res.status(500).send('DB error');
            const total = (cartItems || []).reduce((sum, item) => sum + item.price * item.quantity, 0);
            res.render('checkout', { user, cart: cartItems || [], total });
        });
    },

    confirmCheckout(req, res) {
        const user = req.session.user;
        fetchCartItems(req, (err, cartItems) => {
            if (err) return res.status(500).send('DB error');
            if (!cartItems || cartItems.length === 0) {
                req.flash('error', 'Your cart is empty.');
                return res.redirect('/cart');
            }

            const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const orderNumber = `ORD-${Date.now()}`;

            Order.createOrder(user.id, orderNumber, cartItems, total, (saveErr, savedOrder) => {
                if (saveErr) {
                    console.error('Order save failed:', saveErr);
                    if (saveErr.code === 'INSUFFICIENT_STOCK') {
                        req.flash('error', 'Insufficient stock for one or more items. Please update your cart.');
                        return res.redirect('/cart');
                    }
                    return res.status(500).send('Unable to place order');
                }

                sendReceiptEmail(user, cartItems, total, orderNumber).catch((emailErr) => {
                    console.error('Email send failed:', emailErr);
                });

                clearCart(req, (clearErr) => {
                    if (clearErr) return res.status(500).send('DB error');
                    req.session.lastOrder = {
                        orderId: savedOrder.orderId,
                        orderNumber,
                        cart: cartItems,
                        total,
                        userSnapshot: {
                            username: user.username,
                            email: user.email,
                            address: user.address,
                            contact: user.contact
                        },
                        placedAt: new Date().toISOString()
                    };
                    res.redirect('/checkout/success');
                });
            });
        });
    },

    checkoutSuccess(req, res) {
        const order = req.session.lastOrder;
        if (!order) {
            req.flash('error', 'No recent order found.');
            return res.redirect('/cart');
        }
        res.render('checkout-success', {
            orderId: order.orderId,
            orderNumber: order.orderNumber,
            cart: order.cart,
            total: order.total,
            user: order.userSnapshot,
            placedAt: order.placedAt
        });
    },

    listOrders(req, res) {
        const userId = req.session.user.id;
        Order.getOrdersWithItemsByUser(userId, (err, orders, itemsByOrder) => {
            if (err) return res.status(500).send('DB error');
            res.render('orders', { orders: orders || [], itemsByOrder: itemsByOrder || {}, user: req.session.user });
        });
    }
};

module.exports = OrderController;
