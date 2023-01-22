import path from 'path'
import { fileURLToPath } from 'url'
import session from 'express-session'
import memorystore from 'memorystore'
import { v4 as uuid } from 'uuid';

const MemoryStore = memorystore(session)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Index.js
import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express'
import https from 'https'
import http from 'http'
import { parseTemplate, fsPromise } from './core/util.js'
import { readDirectory } from './core/files.js'
import { initiateApi } from './core/api.js'
import { parsePage } from './core/parse.js'
import { setCached, getCached } from './core/data.js'
import { extractRoutes } from './core/extract.js'
import compression from 'compression'
import cookies from 'cookie-parser'
import { md5 } from 'hash-wasm'
import { rehype } from 'rehype'
import rehypePrism from 'rehype-prism-plus'
import nfs from 'fs'
import rateLimit from 'express-rate-limit'
import { JSDOM } from 'jsdom'
import WebSocket from 'ws'
import { nanoid } from 'nanoid'

// xml specific routes
import { xmlRouter } from './core/xml.js';

// *.model.js
import articleObject from './models/article.model.js';
import seriesObject from './models/series.model.js';
import quizObject from './models/quiz.model.js';

const Article = articleObject.data;
const Series = seriesObject.data;
const Quiz = quizObject.data;

// app, port, options
let app = express()
let port = 3000
let jsonParser = express.json()

initiateApi(app, jsonParser, express.text({ type: 'text/html', limit: '50mb' }))

if(process.env.environment === "staging") {
    port = 1234;
}
let options = {};

// apply to all requests
app.use(cookies());
app.use(rateLimit({
    windowMs: 5 * 60 * 1000, // 15 minutes
    max: 10000 // limit each IP to 10000 requests per 15 min window
}));

// Setup server
let server
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
// cors
// Set static folder
app.use('/', express.static(__dirname + '/public', { maxAge: '365d' }));

// Track session loaded files.. so we can remove duplicate CSS in advance
// Expedite sending of data using redis, and clear loaded file cache on any new get request
const sessionData = session({ 
    genid: function(req) {
        return uuid() // use UUIDs for session IDs
    },
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: true,
        maxAge: 86400000,
        sameSite: false
    },
    store: new MemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
    }),
    resave: false,
    secret: process.env.sessionSecret
})

app.use(sessionData, async (req, res, next) => {
    try {
        req.session.csrf = nanoid(64);
        // Store information on loadedFiles
        if (req.method === "GET") {
            req.session.fileCache = {};
        }
        else {
            next();
            return;
        }

        next();
    }
    catch(e) {
        console.log(e);
        next();
    }

});

// Configure all page routes
let pages = await readDirectory('./views/pages', false);
if(pages !== undefined && Array.isArray(pages)) {
    for(let key of pages) {
        if(key !== undefined && key !== '404.html') {
            let openPage = await extractRoutes(key);
            let pageRoutes = openPage.routes;
            if(Array.isArray(pageRoutes) && pageRoutes.length > 0) {
                app.get(pageRoutes, sessionData, async (req, res, next) => {
                    console.log('ok')
                    if(openPage.stale) {
                        let getUrl = new URL(req.protocol + '://' + req.get('host') + req.originalUrl);
                        let pathname = getUrl.pathname;
                        if(getUrl.pathname.at(-1) === '/') {
                            pathname = pathname.slice(0, -1);
                        }
                        req.cacheTerm = await md5(pathname);
                        if(req.originalUrl === '/') {
                            req.cacheTerm = await md5('root-full-metal-alchemist');
                        }
                        req.output = await getCached('staleFile', `${req.cacheTerm}`)
                        
                        console.log(getUrl, req.output)
                        const timerId = uuid();
                        if(req.method == "GET" && req.output) {
                            console.time(`sent-by-cache-${timerId}`)
                            res.send(req.output)
                            console.timeLog(`sent-by-cache-${timerId}`)
                            let getPage = await parsePage(key.split('.html')[0], req, openPage.headless, false)
                            await setCached('staleFile', `${req.cacheTerm}`, getPage)
                        }
                        else {
                            req.output = await parsePage(key.split('.html')[0], req, openPage.headless, false)
                            console.log(req.output)
                            if(req.output.next) {
                                next()
                            }
                            else {
                                await setCached('staleFile', `${req.cacheTerm}`, req.output)
                                res.send(req.output)
                            }
                        }
                    }
                    else {
                        let getPage = await parsePage(key.split('.html')[0], req, openPage.headless, false)
                        if(getPage.next) {
                            next()
                        }
                        else {
                            if(!req.cache) {
                                req.output = getPage
                            }
                            if(res.headersSent !== true) {
                                res.send(req.output)
                            }
                        }
                    }
                });
            }
        }
    }
}

// Configure all post routes
let posts = await readDirectory('./views/post', false)
if(posts !== undefined && Array.isArray(posts)) {
    for(let key of posts) {
        let openPage = await extractRoutes(key, true)
        let pageRoutes = openPage.routes;
        if(Array.isArray(pageRoutes) && pageRoutes.length > 0) {
            app.post(pageRoutes, sessionData, jsonParser, async (req, res, next) => {
                let getPage = await parsePage(key.split('.html')[0], req, openPage.headless, true)
                if(getPage.next) {
                    next()
                }
                else {
                    req.output = getPage
                }
                if(res.headersSent !== true) {
                    res.send(req.output);
                }
            });
        }
    }
}
// *.controller.js files
app.use('/', xmlRouter);

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
                                let completeQuiz = `<div id="complete-quiz" data-medal="{{medal}}"><span>{{medal}}</span></div><div id="progress-bar-holder"><div id="progress-bar"><div id="progress-bar-percentage" class="quiz-reward" style="width: {{percentage}};"></div></div></div><div id="complete-header" class="fl"><h2>Quiz Complete!</h2></div><div id="message">{{message}}</div><div id="associated-article">{{assocArticle}}</div>`

                                let relatedItem = await Article.findOne({ 'canonicalName': document[0].article });

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
                Quiz.find({ 'canonicalName' : `${data.canonicalName}` }, async function(err, document) {  
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
                Quiz.find({ 'canonicalName' : `${data.canonicalName}` }, async function(err, document) {  
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
app.use(sessionData, async (req, res, next) => {
    // If it's a seven hour flight or a 45 minute drive
    if(req.session?.headersSent !== true && req.method == "GET" || req.session?.noData == true && req.method == "GET") {
        let output = await parsePage('404', req);
        res.send(output)
    }
    else {
        next()
    }
});

app.post('*', async (req, res) => {
    if(res.headersSent !== true && req.method == "POST") {
        res.send({ "error" : "404 - that page was not found" })
    }
})

// Hey.. Listen!
server.listen(port);