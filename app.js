try { require('dotenv').config(); } catch(e) {}

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── STATIC ──
app.use(express.static(path.join(__dirname, 'public')));

// ── API ──
app.use('/api/manga', require('./api/manga'));

// ── HELPERS ──
const pub = (file) => path.join(__dirname, 'public', file);

// ── PAGES ──
app.get('/',          (req, res) => res.sendFile(pub('index.html')));
app.get('/list',      (req, res) => res.sendFile(pub('list.html')));
app.get('/search',    (req, res) => res.sendFile(pub('search.html')));
app.get('/detail',    (req, res) => res.sendFile(pub('detail.html')));
app.get('/chapter',      (req, res) => res.sendFile(pub('chapter.html')));
app.get('/bookmarks', (req, res) => res.sendFile(pub('bookmarks.html')));

// ── 404 ──
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ status: false, message: 'Not Found' });
    }
    res.status(404).sendFile(pub('404.html'));
});

if (require.main === module) {
    app.listen(PORT, () => console.log(`🚀 LunarToons http://localhost:${PORT}`));
}

module.exports = app;

