const Cart = require('../models/Cart');

const CartController = {
    viewCart(req, res) {
        const user = req.session.user;
        if (user && user.id) {
            Cart.getItemsByUserId(user.id, (err, cart) => {
                if (err) return res.status(500).send('DB error');
                const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
                res.render('cart', { cart, total, user });
            });
        } else {
            const cart = req.session.cart || [];
            const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
            res.render('cart', { cart, total, user });
        }
    },

    addItem(req, res) {
        const productId = parseInt(req.params.id, 10);
        const quantity = parseInt(req.body.quantity, 10) || 1;
        if (Number.isNaN(productId) || quantity < 1) {
            return res.status(400).json({ success: false, message: 'Invalid quantity' });
        }
        const user = req.session.user;

        const handleError = (message) => {
            if (req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest') return res.status(400).json({ success: false, message });
            req.flash('error', message);
            return res.redirect('/shopping');
        };

        const Product = require('../models/Product');
        Product.getById(productId, (err, product) => {
            if (err || !product) return handleError('Product not found');
            if (product.quantity <= 0) return handleError('Out of stock');

            const available = product.quantity;

        const getReturnTo = () => {
            const fromBody = (req.body.returnTo || '').trim();
            if (fromBody && fromBody.startsWith('/')) return fromBody;
            const ref = req.get('referer') || '';
            try {
                const url = new URL(ref);
                if (url.pathname) return url.pathname;
            } catch (e) { /* ignore parse errors */ }
            return null;
        };
        const returnTo = getReturnTo();

        const fallbackReturn = returnTo || (req.body.fromProduct === 'true' ? `/product/${productId}` : null);

        if (user && user.id) {
            Cart.getItem(user.id, productId, (itemErr, existing) => {
                if (itemErr) return res.status(500).json({ success: false, message: 'DB error' });
                const currentQty = existing ? existing.quantity : 0;
                const newTotal = currentQty + quantity;
                if (newTotal > available) return handleError('Requested quantity exceeds available stock');

                    Cart.addOrIncrement(user.id, productId, quantity, (addErr) => {
                        if (addErr) return res.status(500).json({ success: false, message: 'DB error' });
                        if (req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest') return res.json({ success: true });
                        if (returnTo) return res.redirect(returnTo);
                        if (req.body.action === 'buy') return res.redirect('/cart');
                        if (fallbackReturn) return res.redirect(fallbackReturn);
                        return res.redirect('/shopping');
                    });
                });
        } else {
            if (!req.session.cart) req.session.cart = [];
            const idx = req.session.cart.findIndex(i => i.id === productId);
            const currentQty = idx > -1 ? req.session.cart[idx].quantity : 0;
                const newTotal = currentQty + quantity;
                if (newTotal > available) return handleError('Requested quantity exceeds available stock');

                if (idx > -1) req.session.cart[idx].quantity = newTotal;
                else req.session.cart.push({
                    id: productId,
                    productName: req.body.productName,
                    price: parseFloat(req.body.price),
                    image: req.body.image,
                    quantity
                });
                if (req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest') return res.json({ success: true });
                if (returnTo) return res.redirect(returnTo);
                if (req.body.action === 'buy') return res.redirect('/cart');
                if (fallbackReturn) return res.redirect(fallbackReturn);
                return res.redirect('/shopping');
            }
        });
    },

    removeItem(req, res) {
        const productId = parseInt(req.params.id, 10);
        const user = req.session.user;
        if (user && user.id) {
            Cart.removeItem(user.id, productId, (err) => {
                if (err) req.flash('error', 'DB error');
                res.redirect('/cart');
            });
        } else {
            if (req.session.cart) req.session.cart = req.session.cart.filter(i => i.id !== productId);
            res.redirect('/cart');
        }
    }
};

module.exports = CartController;
