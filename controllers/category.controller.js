// category.controller.js
import express from 'express'
import { createPage } from '../util.js'

// *.model.js
import { Category } from '../models/category.model.js';

// *.view.js
import { articleStructure } from '../views/article.view.js';

const categoryRouter = express.Router();

categoryRouter.get([ '/category/:categoryName/', '/category/:categoryName/page?/:page?' ], async function(req, res, next) {
    let thisCategory = await Category.findOne({ 'title' : req.params.categoryName }).lean();
    if(thisCategory !== null) {
        req.output = await createPage('category.page.html', {
            ...thisCategory,
            'content' : await articleStructure.generateArchiveArticles(req.params.categoryName, req.params.page || 0, req)
        }, {
            title: `${process.env.websiteName} - ${thisCategory.displayTitle}`,
            description: thisCategory.description,
            canonical: `${process.env.rootUrl}${req.originalUrl}`
        }, req);
        if(res.headersSent !== true) {
            res.send(req.output);
        }
        next();     
    } else {
        next();
    }
});

categoryRouter.get([ '/search/:term', '/tag/:term' ], async function(req, res, next) {
    let beforeTitle = '#';
    if(req.originalUrl.indexOf('/search/') > -1) {
        beforeTitle = 'Search Results for '
    }
    req.output = await createPage('search.page.html', {
        category : `${beforeTitle} ${req.params.term}`,
        content : await articleStructure.singleColumn(req.params.term, undefined, req, (req.originalUrl.indexOf('/search/') > -1))
    }, {
        title: `Search Results for "${req.params.term}"`,
        description: `Search Results for "${req.params.term}" - ${process.env.websiteDescription}`,
        canonical: `${process.env.rootUrl}${req.originalUrl}`,
        classes: 'search'
    }, req);
    if(res.headersSent !== true) {
        res.send(req.output);
    }
    next();
});

export { categoryRouter };