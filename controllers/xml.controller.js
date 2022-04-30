// xml.controller.js
import rss from 'rss'
import express from 'express'
import { SitemapStream, streamToPromise } from 'sitemap'
import { createGzip } from 'zlib'
import xmlParser from 'body-parser-xml';

xmlParser(express);
let xmlRouter = express.Router();
let runXmlParser = express.xml();

// *.model.js
import { Article } from '../models/article.model.js';
import { Category } from '../models/category.model.js';

xmlRouter.get('/sitemap.xml', async function(req, res) {
    res.header('Content-Type', 'application/xml');
    res.header('Content-Encoding', 'gzip');
    let sitemap;
    try {
        const queryArticles = await Article.find({ published: true }).select('canonicalName')
        const queryCategories = await Category.find({}).select('title')

        const articles = queryArticles.map( ({ canonicalName }) => `/article/${canonicalName}`)
        const categories = queryCategories.map( ({ title }) => `/category/${title}`)

        const smStream = new SitemapStream({ hostname: process.env.rootUrl })
        const pipeline = smStream.pipe(createGzip())

        // Add each article URL to the stream
        articles.forEach(function(item) {
            smStream.write({ url: item, changefreq: 'weekly', priority: 0.8})
        });

        // Add each category URL to the stream
        categories.forEach(function(item) {
            smStream.write({ url: item, changefreq: 'monthly', priority: 0.6})
        });

        // cache the response
        streamToPromise(pipeline).then(sm => sitemap = sm)
        
        smStream.end()

        // Show errors and response
        pipeline.pipe(res).on('error', (e) => {throw e})
    } catch (e) {
        console.error(e)
        res.status(500).end()
    }
});

xmlRouter.get('/rss.xml', runXmlParser, async function(req, res) {

    res.header('Content-Type', 'application/xml');
    
    try {
        const queryCategories = await Category.find({}).select('title');
        const categories = queryCategories.map( ({ title }) => `${title}`)

        let feed = new rss({
            title: process.env.websiteName,
            description: process.env.websiteDescription,
            feed_url: 'https://' + req.headers.host + req.url,
            site_url: 'https://' + req.headers.host,
            image_url: 'https://' + req.headers.host + '/favicon.png',
            language: 'en',
            ttl: '60',
            copyright: process.env.websiteName,
            categories: Object.values(categories)
        });

        const queryArticles = await Article.find({ published: true }).sort('-date');

        queryArticles.forEach(function(item) {

            feed.item({
                title: item.titles[0].title,
                description: item.description,
                url: 'https://' + req.headers.host + '/article/' +  item.canonicalName,
                date: item.date,
                category: item.category,
                guid: item.canonicalName,
                enclosure: { 
                    url: `https://${req.headers.host}/images/intro-images/${item.canonicalName}.png`
                }
            }); 

        });
        res.send(feed.xml());

    } catch (e) {
        console.error(e)
        res.status(500).end()
    }
});

export { xmlRouter }