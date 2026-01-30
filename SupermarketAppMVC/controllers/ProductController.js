const Product = require('../models/Product');

const ProductController = {
    listInventory(req, res) {
        const search = (req.query.search || '').trim().toLowerCase();
        Product.getAll((err, products) => {
            if (err) {
                console.error('Error fetching products:', err);
                return res.status(500).send('Database error');
            }
            let filtered = products;
            if (search) {
                filtered = products.filter(p => (p.productName || '').toLowerCase().includes(search));
            }
            return res.render('inventory', { products: filtered, user: req.session.user, search });
        });
    },

    listShopping(req, res) {
        Product.getAll((err, products) => {
            if (err) {
                console.error('Error fetching products:', err);
                return res.status(500).send('Database error');
            }
            return res.render('shopping', { products, user: req.session.user });
        });
    },

    show(req, res) {
        const id = req.params.id;
        Product.getById(id, (err, product) => {
            if (err) {
                console.error('Error fetching product:', err);
                return res.status(500).send('Database error');
            }
            if (!product) return res.status(404).send('Product not found');
            return res.render('product', { product, user: req.session.user });
        });
    },

    renderAddForm(req, res) {
        res.render('addProduct', { user: req.session.user });
    },

    renderUpdateForm(req, res) {
        const id = req.params.id;
        Product.getById(id, (err, product) => {
            if (err) {
                console.error('Error fetching product:', err);
                return res.status(500).send('Database error');
            }
            if (!product) return res.status(404).send('Product not found');
            res.render('updateProduct', { product, user: req.session.user });
        });
    },

    add(req, res) {
        const { name, quantity, price } = req.body;
        const image = req.file ? req.file.filename : null;

        const product = {
            productName: name,
            quantity: quantity ? parseInt(quantity, 10) : 0,
            price: price ? parseFloat(price) : 0,
            image
        };

        Product.add(product, (err) => {
            if (err) {
                console.error('Error adding product:', err);
                return res.status(500).send('Database error');
            }
            return res.redirect('/inventory');
        });
    },

    update(req, res) {
        const id = req.params.id;
        const { name, quantity, price } = req.body;
        let image = req.body.currentImage || null;
        if (req.file) image = req.file.filename;

        const product = {
            productName: name,
            quantity: quantity ? parseInt(quantity, 10) : 0,
            price: price ? parseFloat(price) : 0,
            image
        };

        Product.update(id, product, (err) => {
            if (err) {
                console.error('Error updating product:', err);
                return res.status(500).send('Database error');
            }
            return res.redirect('/inventory');
        });
    },

    delete(req, res) {
        const id = req.params.id;
        Product.delete(id, (err) => {
            if (err) {
                console.error('Error deleting product:', err);
                return res.status(500).send('Database error');
            }
            return res.redirect('/inventory');
        });
    },

    categories(req, res) {
        const search = (req.query.search || '').trim();

        const renderCategories = (message) => {
            Product.getAll((err, products) => {
                if (err) {
                    console.error('Error fetching products:', err);
                    return res.status(500).send('Database error');
                }
                const grouped = {};
                products.forEach(p => {
                    const cat = p.category || 'Others';
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(p);
                });
                const categoryNames = Object.keys(grouped).sort();
                res.render('categories', {
                    user: req.session.user,
                    categories: categoryNames,
                    productsByCategory: grouped,
                    search,
                    message
                });
            });
        };

        if (search) {
            Product.findByName(search, (err, product) => {
                if (err) {
                    console.error('Error searching product:', err);
                    return res.status(500).send('Database error');
                }
                if (product) {
                    return res.redirect(`/product/${product.id}`);
                }
                return renderCategories('No product found with that name.');
            });
        } else {
            renderCategories(null);
        }
    },

    categoryDetail(req, res) {
        const category = req.params.category;
        Product.getByCategory(category, (err, products) => {
            if (err) {
                console.error('Error fetching category products:', err);
                return res.status(500).send('Database error');
            }
            const title = category.charAt(0).toUpperCase() + category.slice(1);
            res.render('category-detail', {
                user: req.session.user,
                category: title,
                products
            });
        });
    },

    manageCategories(req, res) {
        Product.getAll((err, products) => {
            if (err) {
                console.error('Error fetching products:', err);
                return res.status(500).send('Database error');
            }
            const grouped = {};
            products.forEach(p => {
                const cat = p.category || 'Others';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(p);
            });
            const categories = Object.keys(grouped).sort();
            res.render('manage-categories', {
                user: req.session.user,
                products,
                categories,
                messages: req.flash('success'),
                errors: req.flash('error')
            });
        });
    },

    updateCategory(req, res) {
        const productId = parseInt(req.body.productId, 10);
        const selected = (req.body.categorySelect || '').trim();
        const custom = (req.body.categoryNew || '').trim();
        const category = custom || selected || null;

        if (!productId || !category) {
            req.flash('error', 'Product and category are required.');
            return res.redirect('/categories/manage');
        }

        Product.updateCategory(productId, category, (err) => {
            if (err) {
                if (err.code === 'CATEGORY_COLUMN_MISSING') {
                    req.flash('error', 'Category column missing in products table. Please add: ALTER TABLE products ADD COLUMN category VARCHAR(100);');
                } else {
                    console.error('Error updating category:', err);
                    req.flash('error', 'Unable to update category.');
                }
                return res.redirect('/categories/manage');
            }
            req.flash('success', 'Category updated.');
            res.redirect('/categories/manage');
        });
    }
};

module.exports = ProductController;
