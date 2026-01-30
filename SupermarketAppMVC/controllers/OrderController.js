const nodemailer = require('nodemailer');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const paypal = require('../services/paypal');

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

const clearCartAsync = (req) => new Promise((resolve, reject) => {
    clearCart(req, (err) => (err ? reject(err) : resolve()));
});

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

const fetchCartItemsAsync = (req) => new Promise((resolve, reject) => {
    fetchCartItems(req, (err, cartItems) => (err ? reject(err) : resolve(cartItems || [])));
});

const createOrderRecord = (userId, orderNumber, cartItems, total) => new Promise((resolve, reject) => {
    Order.createOrder(userId, orderNumber, cartItems, total, (err, savedOrder) => {
        if (err) return reject(err);
        resolve(savedOrder);
    });
});

const calculateTotal = (items) => items.reduce((sum, item) => sum + item.price * item.quantity, 0);

const OrderController = {
    showCheckout(req, res) {
        const user = req.session.user;
        fetchCartItems(req, (err, cartItems) => {
            if (err) return res.status(500).send('DB error');
            const total = calculateTotal(cartItems || []);
            res.render('checkout', {
                user,
                cart: cartItems || [],
                total
            });
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
    },

    showPaymentMethod(req, res) {
        const user = req.session.user;
        fetchCartItems(req, (err, cartItems) => {
            if (err) return res.status(500).send('DB error');
            if (!cartItems || cartItems.length === 0) {
                req.flash('error', 'Your cart is empty.');
                return res.redirect('/cart');
            }
            const total = calculateTotal(cartItems || []);
            res.render('payment-method', {
                user,
                cart: cartItems || [],
                total,
                paypalClientId: process.env.PAYPAL_CLIENT_ID
            });
        });
    },

    // PayPal: create an order based on the authenticated user's cart
    async createPaypalOrder(req, res) {
        try {
            const cartItems = await fetchCartItemsAsync(req);
            if (!cartItems || cartItems.length === 0) {
                return res.status(400).json({ error: 'Your cart is empty.' });
            }
            const total = calculateTotal(cartItems);
            const order = await paypal.createOrder(total.toFixed(2));
            if (order && order.id) {
                return res.json({ id: order.id });
            }
            return res.status(500).json({ error: 'Failed to create PayPal order', details: order });
        } catch (err) {
            console.error('PayPal create-order failed:', err);
            return res.status(500).json({ error: 'Failed to create PayPal order', message: err.message });
        }
    },

    // PayPal: capture an order, create the local order, and clear the cart
    async capturePaypalOrder(req, res) {
        const user = req.session.user;
        if (!user || !user.id) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { orderID } = req.body;
        if (!orderID) {
            return res.status(400).json({ error: 'Missing orderID' });
        }

        try {
            const capture = await paypal.captureOrder(orderID);
            if (!capture || capture.status !== 'COMPLETED') {
                return res.status(400).json({ error: 'Payment not completed', details: capture });
            }

            const cartItems = await fetchCartItemsAsync(req);
            if (!cartItems || cartItems.length === 0) {
                return res.status(400).json({ error: 'Your cart is empty.' });
            }

            const total = calculateTotal(cartItems);
            const captureDetails = capture.purchase_units?.[0]?.payments?.captures?.[0];
            const capturedAmount = parseFloat(captureDetails?.amount?.value || '0');
            const currency = captureDetails?.amount?.currency_code || 'SGD';
            if (!Number.isFinite(capturedAmount) || Math.abs(capturedAmount - total) > 0.01) {
                return res.status(400).json({ error: 'Captured amount does not match cart total.' });
            }

            const orderNumber = `ORD-${Date.now()}`;
            let savedOrder;
            try {
                savedOrder = await createOrderRecord(user.id, orderNumber, cartItems, total);
            } catch (saveErr) {
                console.error('Order save failed:', saveErr);
                if (saveErr.code === 'INSUFFICIENT_STOCK') {
                    return res.status(400).json({ error: 'Insufficient stock for one or more items. Please update your cart.' });
                }
                return res.status(500).json({ error: 'Unable to place order' });
            }

            const transaction = {
                orderId: capture.id,
                payerId: capture.payer?.payer_id,
                payerEmail: capture.payer?.email_address,
                amount: capturedAmount,
                currency,
                status: capture.status,
                time: (captureDetails?.create_time || '').replace('T', ' ').replace('Z', '')
            };
            Transaction.create(transaction).catch((txErr) => {
                console.error('Transaction save failed:', txErr);
            });

            sendReceiptEmail(user, cartItems, total, orderNumber).catch((emailErr) => {
                console.error('Email send failed:', emailErr);
            });

            await clearCartAsync(req);
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

            return res.json({ redirectUrl: '/checkout/success' });
        } catch (err) {
            console.error('PayPal capture-order failed:', err);
            return res.status(500).json({ error: 'Failed to capture PayPal order', message: err.message });
        }
    }
};

module.exports = OrderController;
