require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

const ProductController = require('./controllers/ProductController');
const CartController = require('./controllers/CartController');
const OrderController = require('./controllers/OrderController');
const ReviewController = require('./controllers/ReviewController');
const { UserController, validateRegistration } = require('./controllers/UserController');
const { checkAuthenticated, checkAdmin, checkUser } = require('./middleware/auth');

// Initialize DB connection once
require('./db');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/images'),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());

// Always start at welcome/login and clear any stale session
app.get('/', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Authentication
app.get('/register', UserController.showRegister);
app.post('/register', validateRegistration, UserController.register);
app.get('/login', UserController.showLogin);
app.post('/login', UserController.login);
app.get('/logout', UserController.logout);

// Products
app.get('/inventory', checkAuthenticated, checkAdmin, ProductController.listInventory);
app.get('/shopping', checkAuthenticated, ProductController.listShopping);
app.get('/categories/manage', checkAuthenticated, checkAdmin, ProductController.manageCategories);
app.post('/categories/manage', checkAuthenticated, checkAdmin, ProductController.updateCategory);
app.get('/categories', checkAuthenticated, ProductController.categories);
app.get('/categories/:category', checkAuthenticated, ProductController.categoryDetail);

// Reviews (users only)
app.get('/reviews', checkAuthenticated, checkUser, ReviewController.showForm);
app.post('/reviews', checkAuthenticated, checkUser, ReviewController.submit);
app.get('/reviews/admin', checkAuthenticated, checkAdmin, ReviewController.adminList);
app.get('/product/:id', checkAuthenticated, ProductController.show);
app.get('/addProduct', checkAuthenticated, checkAdmin, ProductController.renderAddForm);
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), ProductController.add);
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, ProductController.renderUpdateForm);
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), ProductController.update);

// Users (admin)
app.get('/users', checkAuthenticated, checkAdmin, UserController.list);
app.get('/users/:id', checkAuthenticated, checkAdmin, UserController.manage);
app.post('/users/:id/update', checkAuthenticated, checkAdmin, UserController.update);
app.post('/users/:id/delete', checkAuthenticated, checkAdmin, UserController.delete);

// Cart
app.get('/cart', checkAuthenticated, CartController.viewCart);
app.post('/add-to-cart/:id', checkAuthenticated, CartController.addItem);
app.post('/remove-from-cart/:id', checkAuthenticated, CartController.removeItem);

// Checkout / Orders
app.get('/checkout', checkAuthenticated, checkUser, OrderController.showCheckout);
app.post('/checkout/confirm', checkAuthenticated, checkUser, OrderController.confirmCheckout);
app.get('/checkout/success', checkAuthenticated, checkUser, OrderController.checkoutSuccess);
app.get('/orders', checkAuthenticated, checkUser, OrderController.listOrders);

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
