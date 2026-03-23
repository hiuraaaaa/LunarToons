// api/manga.js
const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const router  = express.Router();

const SCRAPER_KEY = process.env.SCRAPER_API_KEY;

async function fetchPage(url) {
    const scraperUrl = `http://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=true`;
    const res = await axios.get(scraperUrl, { timeout: 30000 });
    return cheerio.load(res.data);
}
function parseBsx($, container) {
    const items = [];
    $(container).find('.bsx').each((_, el) => {
        const a       = $(el).find('a').first();
        const url     = a.attr('href') || null;
        const title   = a.attr('title') || $(el).find('.tt').text().trim() || null;
        const cover   = $(el).find('img').first().attr('src') || null;
        const type    = $(el).find('[class^="type"]').text().trim() || null;
        const status  = $(el).find('[class^="status"]').text().trim() || null;
        const chapter = $(el).find('.epxs').text().trim() || null;
        if (url && title) items.push({ title, url, cover, type, status, chapter });
    });
    return items;
}

function getPagination($, page) {
    let max = 1;
    $('.pagination .page-numbers, .hpage .r').each((_, el) => {
        const n = parseInt($(el).text().trim());
        if (!isNaN(n) && n > max) max = n;
    });
    return { page, total_pages: max, next_page: page < max ? page + 1 : null, prev_page: page > 1 ? page - 1 : null };
}

// ── HOME ──
router.get('/home', async (req, res) => {
    try {
        const $ = await fetchPage(BASE + '/');
        const sections = [];
        $('.bixbox').each((_, box) => {
            const title    = $(box).find('.releases h3').first().text().trim();
            if (!title) return;
            const view_all = $(box).find('.releases .vl').attr('href') || null;
            const items    = parseBsx($, box);
            if (items.length) sections.push({ section: title, view_all, items });
        });
        res.json({ status: true, result: sections });
    } catch(e) { res.status(500).json({ status: false, error: e.message }); }
});

// ── LIST ──
router.get('/list', async (req, res) => {
    try {
        const page   = parseInt(req.query.page   || '1');
        const order  = req.query.order  || 'update';
        const type   = req.query.type   || '';
        const status = req.query.status || '';
        const genres = req.query.genre  ? String(req.query.genre).split(',').map(g => g.trim()) : [];

        let params = `order=${order}`;
        if (type)   params += `&type=${type}`;
        if (status) params += `&status=${status}`;
        genres.forEach(g => { params += `&genre[]=${g}`; });

        const url = page > 1
            ? `${BASE}/manga/page/${page}/?${params}`
            : `${BASE}/manga/?${params}`;

        const $     = await fetchPage(url);
        const items = parseBsx($, '.listupd');
        res.json({ status: true, result: { ...getPagination($, page), order, type: type || 'all', status: status || 'all', genres, items } });
    } catch(e) { res.status(500).json({ status: false, error: e.message }); }
});

// ── GENRES ──
router.get('/genres', async (req, res) => {
    try {
        const $ = await fetchPage(`${BASE}/manga/`);
        const genres = [];
        $('input.genre-item').each((_, el) => {
            const id   = $(el).attr('value') || null;
            const name = $(`label[for="genre-${id}"]`).text().trim();
            if (id && name) genres.push({ id, name });
        });
        res.json({ status: true, result: genres });
    } catch(e) { res.status(500).json({ status: false, error: e.message }); }
});

// ── SEARCH ──
router.get('/search', async (req, res) => {
    try {
        const keyword = req.query.q || req.query.keyword;
        if (!keyword) return res.status(400).json({ status: false, error: 'Parameter q wajib diisi' });
        const $     = await fetchPage(`${BASE}/?s=${encodeURIComponent(keyword)}`);
        const items = parseBsx($, '.listupd');
        res.json({ status: true, result: items });
    } catch(e) { res.status(500).json({ status: false, error: e.message }); }
});

// ── DETAIL ──
router.get('/detail', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, error: 'Parameter url wajib diisi' });

        const $ = await fetchPage(url);

        const title    = $('h1.entry-title').text().trim();
        const cover    = $('.thumbook img').first().attr('src') || null;
        const synopsis = $('.wd-full .entry-content, .synops, [itemprop="description"]').first().text().trim() || null;
        const rating   = $('.num').first().text().trim() || null;
        const type     = $('.tsinfo .imptdt a').first().text().trim() || null;
        const status   = $('.tsinfo .imptdt i').first().text().trim() || null;

        const info = {};
        $('.infox .fmed').each((_, el) => {
            const key = $(el).find('b').text().trim();
            const val = $(el).find('span').text().trim();
            if (key && val && val !== '-') info[key] = val;
        });
        if (status) info['Status'] = status;
        if (type)   info['Type']   = type;

        const genres = [];
        $('.mgen a').each((_, a) => { const g = $(a).text().trim(); if (g) genres.push(g); });

        const chapters = [];
        $('#chapterlist ul li, .eplister ul li').each((_, li) => {
            const a     = $(li).find('a').first();
            const chUrl = a.attr('href') || null;
            const chNum = $(li).find('.chapternum').text().replace(/\s+/g, ' ').trim();
            const date  = $(li).find('.chapterdate').text().trim();
            if (chUrl) chapters.push({ chapter: chNum, url: chUrl, date });
        });

        res.json({ status: true, result: { title, cover, rating, synopsis, info, genres, chapters } });
    } catch(e) { res.status(500).json({ status: false, error: e.message }); }
});

// ── CHAPTER ──
router.get('/chapter', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, error: 'Parameter url wajib diisi' });

        const $ = await fetchPage(url);
        const html = $.html();

        const match = html.match(/ts_reader\.run\((\{[\s\S]*?\})\)/);
        if (!match) return res.status(500).json({ status: false, error: 'Gagal extract data chapter' });

        const data    = JSON.parse(match[1]);
        const prev    = data.prevUrl || null;
        const next    = data.nextUrl || null;
        const sources = (data.sources || []).map(s => ({
            source: s.source,
            images: (s.images || []).filter(img => !img.endsWith('.gif'))
        }));
        const images     = sources[0]?.images || [];
        const title      = $('h1.entry-title').text().trim();
        const series_url = $('.allc a, .headpost .allc a').first().attr('href') || null;

        res.json({ status: true, result: { title, series_url, prev, next, total_pages: images.length, sources, images } });
    } catch(e) { res.status(500).json({ status: false, error: e.message }); }
});

// ── PROJECTS ──
router.get('/projects', async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const url  = page > 1 ? `${BASE}/projects/page/${page}/` : `${BASE}/projects/`;
        const $    = await fetchPage(url);
        const items = parseBsx($, '.listupd');
        res.json({ status: true, result: { ...getPagination($, page), items } });
    } catch(e) { res.status(500).json({ status: false, error: e.message }); }
});

// ── LIST MODE ──
router.get('/listmode', async (req, res) => {
    try {
        const letter = (req.query.letter || '').toUpperCase();
        const $      = await fetchPage(`${BASE}/manga/list-mode/`);

        const result = [];
        $('.blix').each((_, box) => {
            const char  = $(box).find('span a').first().text().trim();
            const items = [];
            $(box).find('ul li a.series').each((_, a) => {
                const title = $(a).text().trim();
                const url   = $(a).attr('href') || null;
                const id    = $(a).attr('rel') || null;
                if (title && url) items.push({ id, title, url });
            });
            if (items.length) result.push({ char, items });
        });

        const filtered = letter
            ? result.filter(g => g.char.toUpperCase() === letter)
            : result;

        const total = filtered.reduce((acc, g) => acc + g.items.length, 0);
        res.json({ status: true, result: { total, filter: letter || 'all', data: filtered } });
    } catch(e) { res.status(500).json({ status: false, error: e.message }); }
});

module.exports = router;
