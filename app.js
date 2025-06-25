const express = require('express');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY;

// MongoDB Atlas connection
mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: 'SocialDB'
}).then(() => console.log('MongoDB Atlas connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// Models
const User = mongoose.model('User', { username: String, email: String, password: String });
const Post = mongoose.model('Post', { userId: mongoose.Schema.Types.ObjectId, text: String });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: SECRET_KEY, resave: false, saveUninitialized: true, cookie: { secure: false } }));
app.use(express.static(path.join(__dirname, 'public')));

// JWT auth
function authenticateJWT(req, res, next) {
    const token = req.session.token;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
    }
}

function requireAuth(req, res, next) {
    const token = req.session.token;
    if (!token) return res.redirect('/login');
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (err) {
        return res.redirect('/login');
    }
}

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/post', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'post.html')));
app.get('/index', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Register
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) return res.status(400).json({ message: 'User already exists' });

        const newUser = new User({ username, email, password });
        await newUser.save();

        const token = jwt.sign({ userId: newUser._id, username: newUser.username }, SECRET_KEY, { expiresIn: '1h' });
        req.session.token = token;
        res.redirect(`/index?username=${newUser.username}`);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ userId: user._id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
        req.session.token = token;
        res.redirect(`/index?username=${user.username}`);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Create post
app.post('/post', authenticateJWT, async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Post content required' });

    try {
        const newPost = new Post({ userId: req.user.userId, text });
        await newPost.save();
        res.status(201).json({ message: 'Post created', post: newPost });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Get posts
app.get('/posts', authenticateJWT, async (req, res) => {
    try {
        const posts = await Post.find({ userId: req.user.userId });
        res.json({ posts });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Update post
app.put('/posts/:postId', authenticateJWT, async (req, res) => {
    const { postId } = req.params;
    const { text } = req.body;

    try {
        const post = await Post.findOneAndUpdate(
            { _id: postId, userId: req.user.userId },
            { text },
            { new: true }
        );
        if (!post) return res.status(404).json({ message: 'Post not found' });
        res.json({ message: 'Post updated', updatedPost: post });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Delete post
app.delete('/posts/:postId', authenticateJWT, async (req, res) => {
    const { postId } = req.params;
    try {
        const post = await Post.findOneAndDelete({ _id: postId, userId: req.user.userId });
        if (!post) return res.status(404).json({ message: 'Post not found' });
        res.json({ message: 'Post deleted', deletedPost: post });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error(err);
        res.redirect('/login');
    });
});

// Start server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
