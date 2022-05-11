// article.controller.js
import express from 'express'
import { createPage, fsPromise } from '../util.js'
import md from 'markdown-it'

// create application/json parser
let htmlParser = express.text({ type: 'text/html', limit: '50mb' });

// *.model.js
import { Article } from '../models/article.model.js';
import { Category } from '../models/category.model.js';
import { Author } from '../models/author.model.js';
import { Quiz } from '../models/quiz.model.js';
import { Series } from '../models/series.model.js';

// *.view.js
import { articleStructure } from '../views/article.view.js';

const articleRouter = express.Router();

const blockAddonForMarkdown = (md) => {
    let sectionRegex = /\!\!\[(.*?)\]\(\{(.*?)\}\)/gsm;
    let codepenRegex = /{%\scodepen\s<a\shref="[^"]+"\s(.*?)>https:\/\/codepen.io\/(.*?)\/pen\/(.*?)<\/a>\s%}/gsm;
    md.renderer.backuprender = md.renderer.render;

    md.renderer.render = function (tokens, options, env) {
        let result = md.renderer.backuprender(tokens, options, env);
        if (result.match(sectionRegex)) {
            result = result.replace(sectionRegex, '<div class="fl"><div class="inline-box outlined"><h3>$1</h3><p>$2</p></div></div>');
        }
        if (result.match(codepenRegex)) {
            result = result.replace(codepenRegex, `<div class="fl" style="margin: 0 0 2rem 0;"><p class="codepen" data-height="300" data-default-tab="html,result" data-slug-hash="$3" data-user="$2" style="height: 300px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 2px solid; margin: 1em 0; padding: 1em;"><span><a href="https://codepen.io/$2/pen/$3">See the original demo here.</a></span></p><script async src="https://cpwebassets.codepen.io/assets/embed/ei.js"></script></a></div>`);
        }
        return result;
    };
    return md;
}

// Get Singular Article
articleRouter.get(['/article/:articleName/:alias?', '/draft/:articleName/:alias?'], async function(req, res, next) {
    if(typeof req.params.alias == "undefined") {
        req.params.alias = 0;
    }
    
    // This is for generating the various main parts of the user interface
    let articleContent;

    try {          
        // This is for parsing the code editor to have lines and colors 
        // We check for an HTML document first..
        const getFile = await fsPromise(`./documents/${req.params.articleName}.html`)
        articleContent = await articleStructure.parseCode(getFile);

    }
    catch(e) {
        try {
            // If we don't find one, we look for a markdown document
            let data = await fsPromise(`./documents/${req.params.articleName}.md`);
            let markdownIt = blockAddonForMarkdown(md({
                html:         true,
                xhtmlOut:     false,
                breaks:       false,
                langPrefix:   'language-',
                linkify:      true,
                typographer:  true,
                quotes: '“”‘’'
            }))
            
            const defaultRender = markdownIt.renderer.rules.link_open || function(tokens, idx, options, env, self) {
                return self.renderToken(tokens, idx, options);
            };
            
            markdownIt.renderer.rules.link_open = function (tokens, idx, options, env, self) {
                // If you are sure other plugins can't add `target` - drop check below
                let aIndex = tokens[idx].attrIndex('target');

                if (aIndex < 0) {
                    tokens[idx].attrPush(['target', '_blank']); // add new attribute
                } else {
                    tokens[idx].attrs[aIndex][1] = '_blank';    // replace value of existing attr
                }

                // pass token to default renderer.
                return defaultRender(tokens, idx, options, env, self);
            };

            markdownIt.renderer.rules.image = function (tokens, idx, options, env, self) {
                let token = tokens[idx];
                let aIndex = token.attrIndex('src');
                let altText = token.attrIndex('alt');
                if(typeof token?.attrs[altText][1] !== undefined) {
                    altText = token?.attrs[altText][1]
                }
                if(typeof token?.attrs[aIndex] !== "undefined" && typeof token?.attrs[aIndex][1] !== "undefined" && token?.attrs[aIndex][1] !== "") {
                    let fileName = token.attrs[aIndex][1];
                    let altFileName = token.attrs[aIndex][1];
                    let fileType = fileName.split('.');
                    
                    // Update Urls if needed
                    if(fileName.split('/').length == 1 && fileName.split('.').length == 1) {
                        let tempName = fileName;
                        fileName = `/images/misc/${tempName}.png`;
                        altFileName = `/images/misc/${tempName}.webp`;
                    }
                    else if(fileName.split('/').length == 1 && fileName.split('.').length > 1) {
                        let tempName = fileName.split('.')[0];
                        fileName = `/images/misc/${tempName}.png`;
                        altFileName = `/images/misc/${tempName}.webp`;
                    }
                    else if(fileName.split('.').length > 1) {
                        let tempFileType = fileName.split('.')[fileName.split('.').length - 1];
                        let tempName = fileName.split('.').slice(0, -1).join('.');
                        if(tempFileType !== "webp") {
                            fileName = `${tempName}.${tempFileType}`
                            altFileName = `${tempName}.webp`;
                        }
                    }

                    return `
                    <p><picture>
                        <source srcset="${altFileName}" type="image/webp">
                        <img src="${fileName}" alt="${altText}" />
                    </picture></p>`
                }
                // pass token to default renderer.
                return defaultRender(tokens, idx, options, env, self);
            };

            articleContent = await articleStructure.parseCode(markdownIt.render(data));
        }
        catch(e) {
            //console.log(e);
            // console.log('No .md or .html file for this article!');
            next();
            return false;
        }
    }
    // Now that we've parsed code, we check if it's an article or a draft.
    // Articles are more complicated
    if(req.originalUrl.indexOf('/article/') > -1) {
        Article.findOne({ 'canonicalName' : req.params.articleName }, async function(err, article) {
            if(article == null) {
                next();
                return false;
            }
            let articleData = Object.assign({}, article._doc);
            let seriesData = {};
            let classes = [ 'article' ];   
            if(typeof article.series !== "undefined" && article.series !== null && article.series !== "none") {
                let getSeries = await Series.findOne({ canonicalName: article.series }).lean();
                seriesData = Object.assign({}, getSeries);
                if(seriesData !== null) {
                    classes.push('series-item');
                    let seriesItems = seriesData?.seriesItems;
                    let getItem = seriesItems?.find((items) => {
                        return items.canonicalName == article.canonicalName
                    });                        
                    
                    if(getItem !== null && typeof getItem !== "undefined") {
                        let index = seriesItems.indexOf(getItem);
                        for(let key in seriesItems) {
                            key = parseFloat(key);
                            if(index === key - 1 || index === key - 2 || index === key + 1 || index === key + 2) {
                                seriesItems[key].visibleClass = 'visible';
                            }
                            if(key < index) {
                                seriesItems[key].getClass = 'previous';
                            }
                            else if(key === index) {
                                seriesItems[key].getClass = 'this';
                                seriesItems[key].visibleClass = 'visible';
                            }
                            else {
                                seriesItems[key].getClass = 'next';
                            }
                        }
                    }
                }
            }

            articleData.date = new Date(articleData.date).toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            articleData.updated = new Date(articleData.updated || articleData.date).toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            
            // Useful alternative for A/B testing on different titles:
            let title = articleData.titles[0].title;
            if(typeof article.titles[parseFloat(req.params.alias)] !== "undefined") {
                title = article.titles[parseFloat(req.params.alias)].title;
            }
            // Generate article output
            let htmlOutput = req.output = await createPage('article.page.html', {
                ...articleData,
                more: await articleStructure.generateMore(article.canonicalName, article.category),
                content : articleContent,
            },
            {
                category: await Category.findOne({ title: article.category }).lean(),
                author: await Author.findOne({ name: article.author }).lean(),
                quiz: await Quiz.findOne({ associatedCanonical: article.canonicalName }).lean(),
                series: seriesData,
            },
            {
                title: title,
                description: articleData.description,
                canonical: `${process.env.rootUrl}/article/${article.canonicalName}`,
                classes: classes.join(' ')
            }, req);
            if(res.headersSent !== true) {
                res.send(htmlOutput);
            }
            next();
        });
    }
    else if(req.originalUrl.indexOf('/draft/') > -1) {
        try {
            let output = await createPage('draft.page.html', {
                'content' : articleContent,
                'title' : "DRAFT"
            }, {
                title: `${process.env.websiteName} - Draft`, 
                description: process.env.websiteDescription,
                canonical: `${process.env.rootUrl}${req.originalUrl}`,
                robots: 'noindex,nofollow'
            }, req);
            if(res.headersSent !== true) {
                res.send(output);
            } 
            next();
        } 
        catch(e) {
            console.log(e);
            next();
        }
    } else {
        // error handle
        next();
    }
});

articleRouter.get('/subscription/email/template', htmlParser, async function(req, res) {
    let articles = await articleStructure.generateArchiveArticles('email', 0, req);
    let output = await createPage('subscription.email.html', {
        latestArticles: articles
    }, req)
    res.send(output);

});

export { articleRouter };