/* Main application file for Fjolt 
PURPOSE
- Optimises file size with compression
- Apply Redis Cache to every GET request
-- Saves in memory each page so it can be accessed much faster
- Pulls in all routes from controller and api files
*/
import path from 'path'
import { fileURLToPath } from 'url'
import session from 'express-session'
import { v4 as uuid } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Index.js
import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express'
import https from 'https'
import http from 'http'
import { parseTemplate, createPage, apiVerification, fsPromise, fsDirPromise } from './util.js'
import mongoose from 'mongoose'
import compression from 'compression'
import { createClient } from 'redis'
import { rehype } from 'rehype'
import rehypePrism from 'rehype-prism-plus'
import nfs from 'fs'
import rateLimit from 'express-rate-limit'
import { JSDOM } from 'jsdom'
import WebSocket from 'ws';


// *.controller.js
import { articleRouter } from './controllers/article.controller.js';
import { categoryRouter } from './controllers/category.controller.js';
import { seriesRouter } from './controllers/series.controller.js';
import { quizRouter } from './controllers/quiz.controller.js';
import { xmlRouter } from './controllers/xml.controller.js';

// *.api.js
import { articleApi } from './api/article.api.js';
import { imageApi } from './api/image.api.js';
import { authorApi } from './api/author.api.js';
import { categoryApi } from './api/category.api.js';
import { userApi } from './api/user.api.js';
import { seriesApi } from './api/series.api.js';
import { quizApi } from './api/quiz.api.js';
import { roleApi } from './api/role.api.js';
import { tokenApi } from './api/token.api.js';
import { cacheApi } from './api/cache.api.js';
import { accessApi } from './api/access.api.js';

// *.view.js
import { articleStructure } from './views/article.view.js';

// *.model.js
import { Subscription } from './models/subscription.model.js';
import { Article } from './models/article.model.js';
import { Category } from './models/category.model.js';
import { Series } from './models/series.model.js';
import { Quiz } from './models/quiz.model.js';
import { Access } from './models/access.model.js';

// static pages
import { definedPages } from './static.routes.js';

// MongoDb Connection
mongoose.connect(process.env.mongooseUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// Redis Connection
const client = createClient();
client.on('error', (err) => console.log('Redis Client Error', err));
await client.connect();

// app, port, options
let app = express();
let port = 3000
let options = {};

// apply to all requests
app.use(rateLimit({
    windowMs: 5 * 60 * 1000, // 15 minutes
    max: 10000 // limit each IP to 10000 requests per 15 min window
}));

// Setup server
let server;
if(typeof process.env.environment == "undefined"  || process.env.environment !== "dev") {
    // HTTPS environment
    options = {
        key: await fsPromise(process.env.keyLocation),
        cert: await fsPromise(process.env.certLocation),
        ca: await fsPromise(process.env.caLocation)
    }
    server = https.createServer(options, app);
} else {
    // Non-HTTPS environment
    server = http.createServer(app) 
}

// Compress our app
app.use(compression());
// Set static folder
app.use('/', express.static(__dirname + '/public', { maxAge: '365d' }));

// Track session loaded files.. so we can remove duplicate CSS in advance
// Expedite sending of data using redis, and clear loaded file cache on any new get request
app.use(session({ 
    genid: function(req) {
        return uuid() // use UUIDs for session IDs
    },
    resave: false,
    saveUninitialized: false,
    secret: process.env.sessionSecret
}))

app.use(async (req, res, next) => {
    try {
        // Store information on loadedFiles
        if(req.method == "GET" && req.header('accept').indexOf('text/html') > -1 || req.method == "GET" && app.locals.fileCache === undefined || req.header('x-forceCache') === "true") {
            req.session.fileCache = {};
            req.session.touch()
        }
        else {
            next();
            return;
        }
        if(req.header('x-forceCache') === "true") {
            next();
            return;
        }

        if(req.method === "POST") {
            let getAccess = await Access.find();
            let getAccessKeys = [];
            if(getAccess !== null) {
                getAccessKeys = getAccess.map((x) => x.api);
            }
            let check = false;
            if(getAccessKeys.length === 0 || getAccessKeys.indexOf('access') == -1) {
                // No access keys are
                if(req.originalUrl.indexOf('/access') === -1) {
                    res.status(400).send({ "message" : `It seems like no 'access' control has been set up in your access table. To do this, POST to /api/access with { "api" : "access", "importance" : 9999 } first.` })
                }
            }
            else {
                for(let x of getAccessKeys) {
                    if(req.originalUrl.indexOf(x) > -1) {
                        check = true; // This is a valid API
                        let currentKey = getAccess.find((y) => y.api === x)
                        let accessLevel = currentKey.accessLevel;
                        let checkApiAuthentication = await apiVerification(req, accessLevel);
                        if(!checkApiAuthentication) {
                            res.status(400).send({ "message" : "Invalid Credentials. Check your Authentication Details." })
                        }
                        break;
                    }
                }
                if(check == false) {
                    res.status(400).send({ "message" : "Invalid API" })
                }
            }
        }
        // Redis doesn't like "/" as a key - so adjust for "/" route
        req.cacheTerm = req.originalUrl;
        if(req.originalUrl === '/') {
            req.cacheTerm = 'root'
        }
        
        // Redis connection
        req.cache = await client.get(`${req.cacheTerm}`);

        // Send cached data immediately
        if(req.cache !== null && req.cache !== "" && req.header('x-forceCache') !== "true") {
            res.send(req.cache);
            next();
        }
        else {
            next();
        }
    }
    catch(e) {
        console.log(e);
        next();
    }

});

// Configure static pages
let staticPages = await fsDirPromise('./outputs/page/', false);
let archivePages = [ "home", "category", "search", "article", "draft", "quiz", "404", "series" ]
for(let key in staticPages) {
    if(archivePages.indexOf(staticPages[key].split('.')[0]) == -1) {
        if(Object.keys(definedPages).indexOf(staticPages[key]) > -1) {
            let getPage = await definedPages[staticPages[key]]();
            if(getPage.done !== true) {
                app.get(getPage.route, async(req, res, next) => {
                    getPage = await definedPages[staticPages[key]](req);
                    if(getPage.beforeStart !== undefined) {
                        await getPage.beforeStart({
                            Subscription: Subscription,
                            Article: Article, 
                            Category: Category,
                            Series: Series,
                            Quiz: Quiz
                        });
                    }
                    req.output = await createPage(staticPages[key], {
                        ...getPage
                    }, req)
                    if(res.headersSent !== true) {
                        res.send(req.output);
                    }
                    next();
                });
                getPage.done = true;
            }
        }
    }
}

// Defined route for default page + pagination.
app.get([ '/', '/page/:pageNumber?' ], async (req, res, next) => {
    req.output = await createPage('home.page.html', {
        'content' : await articleStructure.generateArchiveArticles('home', (typeof req.params.pageNumber == "number") ? req.params.pageNumber || 0 : 0, req)
    }, {
        title: process.env.websiteName,
        description: process.env.websiteDescription,
        canonical: `${process.env.rootUrl}${req.originalUrl}`
    }, req);
    if(res.headersSent !== true) {
        res.send(req.output);
    }
    next();
});


// *.controller.js files
app.use('/', seriesRouter);
app.use('/', articleRouter);
app.use('/', categoryRouter);
app.use('/', quizRouter);
app.use('/', xmlRouter);

// *.api.js files
app.use('/api/', imageApi);
app.use('/api/', authorApi);
app.use('/api/', articleApi);
app.use('/api/', categoryApi);
app.use('/api/', userApi);
app.use('/api/', seriesApi);
app.use('/api/', quizApi);
app.use('/api/', roleApi);
app.use('/api/', tokenApi);
app.use('/api/', cacheApi);
app.use('/api/', accessApi);

let wss = new WebSocket.Server({ server: server, path: '/ws' });
// Websocket connection
wss.on('connection', function(ws) {
    ws.correctAnswers = 0;
    ws.totalQuestions = 0;
    ws.send(JSON.stringify({ quiz: true }));
    ws.on('message', async function(msg) {
        try {
            let data = JSON.parse(msg);
            if(data.quizQuestion == true && typeof data.canonicalName == "string" && typeof data.questionId == "number") {
                Quiz.find({ 'canonicalName' : data.canonicalName }, async function(err, document) {  
                    try {
                        if(document.length !== 0) {
                            ws.totalQuestions = document[0].questions.length;
                            let getQuestion = document[0].questions[data.questionId];
                            if(typeof getQuestion == "undefined") {
                                // Last question.. so refer to 'complete' page
                                let completeQuiz = await fsPromise('./outputs/quiz/complete.quiz.html', 'utf8');

                                let relatedItem = await Article.findOne({ 'canonicalName': document[0].associatedCanonical });

                                let relatedGuide = null;
                                if(relatedItem !== null) {
                                    relatedGuide = await Series.findOne({ 'canonicalName': relatedItem.series });
                                }
                                
                                let ratioCorrect = ws.correctAnswers /  ws.totalQuestions;
                                let medal = '😱';
                                let message = `Better luck next time! You got <strong>${Math.round(ratioCorrect * 100)}%</strong> right! <a href="">Try again?</a>`; 
                                if(ratioCorrect >= 1) {
                                    medal = '🎖'
                                    message = 'Well done, you got everything right! You can return to our other content with the links below.'
                                } else if(ratioCorrect >= 0.7) {
                                    medal = '🥈'
                                    message = `Pretty good, you got <strong>${Math.round(ratioCorrect * 100)}%</strong> right! Think you can do better? <a href="">Click here to try again</a>`;
                                } else if(ratioCorrect >= 0.4) {
                                    medal = '🥉';                                    
                                    message = `You scraped through, with <strong>${Math.round(ratioCorrect * 100)}%</strong> right! Think you can do better? <a href="">Click here to try again</a>`;
                                }
                                let assocArticle = '';
                                if(relatedItem !== null) {
                                    let image = `/images/intro-images/default`;
                                    if(nfs.existsSync(path.join(__dirname, '../', `views/images/intro-images/${relatedItem.canonicalName}.webp`))) {
                                        image = `/images/intro-images/${relatedItem.canonicalName}`;
                                    }
                                    assocArticle = `
                                        <h2><i class="fal fa-newspaper"></i> Back to Article</h2>
                                        <a href="/article/${relatedItem.canonicalName}" class="associated-article">
                                            <span class="title">${relatedItem.titles[0].title}<span class="description">${relatedItem.description}</span></span>
                                            <span class="image">
                                                <picture>
                                                    <source srcset="${image}.webp" type="image/webp">
                                                    <img src="${image}.png" alt="Image for Article" />
                                                </picture>
                                            </span>
                                        </a>
                                    `;
                                }
                                let getHTML = await parseTemplate(completeQuiz, {
                                    'medal' : medal,
                                    'score' : Math.round(ratioCorrect * 100),
                                    'message' : message,
                                    'percentage' : `${Math.round(ratioCorrect * 100)}%`,
                                    'assocArticle' : assocArticle
                                });
                                ws.send(JSON.stringify({
                                    'finishedQuizHTML' : getHTML,
                                    'quizEnded' : true,
                                    'quizFinalScore' : ratioCorrect
                                }))
                            } else {
                                let options = '';
                                getQuestion.options.forEach(function(item) {
                                    let index = getQuestion.options.indexOf(item);
                                    options += `<span class="option" data-id="${index}">${item}</span>`;
                                });

                                let questionTitle;
                                let dom = new JSDOM(`<!DOCTYPE html><html><body id="main">${getQuestion.question}</body></html>`);
                                if(dom.window.document.querySelectorAll('pre code').length > 0) {
                                    let els = Array.from(dom.window.document.querySelectorAll('pre code'))
                                    for(const item of els) {
                                        const language = item.getAttribute('class');
                                        if(language !== null && language !== '') {
                                            const newEl = dom.window.document.createElement('div');
                                            item.classList.add(`language-${language}`);
                                            item.textContent = item.innerHTML.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').toString();
                                            const getCodeValue = await rehype().use(rehypePrism, { showLineNumbers: true }).process(item.parentElement.outerHTML);
                                            const mergeCode = new JSDOM(`<!DOCTYPE html><html><body id="main">${getCodeValue.value}</body></html>`);
                                            newEl.innerHTML = `${language} <span class="copy">Copy</span>`;
                                            if(mergeCode.window.document.querySelector('code').children[0].textContent.trim() == '') {
                                                mergeCode.window.document.querySelector('code').children[0].remove();
                                                mergeCode.window.document.querySelectorAll('code > span').forEach(function(item) {
                                                    item.setAttribute('line', parseFloat(item.getAttribute('line')) - 1);
                                                });
                                            }
                                            newEl.classList.add('code-options');
                    
                                            item.parentNode.prepend(newEl);
                                            item.innerHTML = mergeCode.window.document.querySelector('code').innerHTML;
                                        }
                                    }
                                    questionTitle = dom.window.document.getElementById('main').innerHTML;
                                }
                                else {
                                    questionTitle = getQuestion.question;
                                }
        
                                let html = `
                                <div class="question">
                                    <div class="question-title">${questionTitle}</div>
                                    <div class="question-options">${options}</div>
                                </div>                
                                <div id="question-submit">
                                    <button class="hover-button" id="submit-individual-question"><span id="submit-question-cover">Submit!</span></button>
                                </div>`;
                                
                                ws.send(JSON.stringify({
                                    'question' : html,
                                    'quizQuestion' : true,
                                    'quizQuestionNumber' : data.questionId
                                }));
                            }
                        } else {
                            ws.send(JSON.stringify({
                                'quizError' : true
                            }))
                        }
                    } catch(e) {
                        console.log(e);
                    }
                });
            }
            if(data.getAnswer == true && typeof data.question == 'number' && (typeof data.answer == 'number' || typeof data.answer == 'object')) {
                Quiz.find({ 'canonicalName' : data.canonicalName }, async function(err, document) {  
                    try {
                        if(document.length !== 0) {
                            let getQuestion = document[0].questions[data.question];
                            if(data.answer !== null && getQuestion.answer == data.answer) {
                                ws.send(JSON.stringify({ 'correctAnswer' : true }));
                                ws.correctAnswers += 1;
                            } else {
                                ws.send(JSON.stringify({ 'correctAnswer' : false, 'theAnswer' : getQuestion.answer }));
                            }

                        } else {
                            ws.send(JSON.stringify({
                                'quizError' : true
                            }))
                        }
                    } catch(e) {
                        console.log(e);
                    }
                });
            }
            if(data.quizAnswer == true && typeof data.quizResponse == 'string') {
                Quiz.find({ 'canonicalName' : data.canonicalName }, async function(err, document) {  
                    if(document.length !== 0) {
                        let getQuestion = document[0].questions[data.questionId];
                    } else {
                        ws.send(JSON.stringify({
                            'quizError' : true
                        }))
                    }
                });
            }
        } catch(e) {
            console.log(e);
        }
        
        // For the boards
        try {
            
        } catch(e) {
            console.log(e);
        }
    });
});

// I'm going back to 404
app.use(async (req, res, next) => {
    // If it's a seven hour flight or a 45 minute drive
    if(res.headersSent !== true && req.method == "GET") {
        let output = await createPage('404.page.html', {},
        {
            title: `${process.env.websiteName} 404, Not Found`,
            canonical: `${process.env.rootUrl}${req.originalUrl}`
        }, req);
        res.send(output);
    }
    else if(res.headersSent !== true) {
        res.send({ "error" : "404 - that page was not found" })
    }
    next();
});

app.use(async (req) => {
    if(req.method === "GET" || req.originalUrl === '/api/forceCache') {
        // Redis doesn't like "/" as a key - so change to "root" for "/" route
        req.cacheTerm = req.originalUrl;
        if(req.originalUrl === '/') {
            req.cacheTerm = 'root'
        }
        // We update every 10 seconds.. so content always remains roughly in sync.
        // So this not only increases speed to user, but also decreases server load
        await client.set(req.cacheTerm, req.output);
    }
});

// Hey.. Listen!
server.listen(port);