/* ƒ ∆ ø ¬ †
-- - - - - -
F J O L T  -
-- - - - - -
ƒ ∆ ø ¬ † */

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
import { apiVerification } from './bin/api.js';
import { parseTemplate, createPage, fsPromise, fsDirPromise, getRoutes } from './bin/util.js'
import mongoose from 'mongoose'
import compression from 'compression'
import { createClient } from 'redis'
import { md5 } from 'hash-wasm'
import { rehype } from 'rehype'
import rehypePrism from 'rehype-prism-plus'
import nfs from 'fs'
import rateLimit from 'express-rate-limit'
import { JSDOM } from 'jsdom'
import WebSocket from 'ws'
import { nanoid } from "nanoid"

// xml specific routes
import { xmlRouter } from './bin/xml.js';

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

// *.model.js
import { Article } from './models/article.model.js';
import { Series } from './models/series.model.js';
import { Quiz } from './models/quiz.model.js';
import { Access } from './models/access.model.js';
import { Subscription } from './models/subscription.model.js';

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
let jsonParser = express.json();
let port = 3000

if(process.env.environment === "staging") {
    port = 1234;
}
let options = {};

// apply to all requests
app.use(rateLimit({
    windowMs: 5 * 60 * 1000, // 15 minutes
    max: 10000 // limit each IP to 10000 requests per 15 min window
}));

// Setup server
let server;
if(typeof process.env.environment == "undefined"  || process.env.environment !== "dev" && process.env.environment !== "staging") {
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
    saveUninitialized: false,    
    cookie: {
        domain: process.env.rootUrl,
        secure: true,
        sameSite: true
    },
    resave: true,
    secret: process.env.sessionSecret
}))

app.use(async (req, res, next) => {
    try {
        // Store information on loadedFiles
        if (req.method == "GET" && req.session.csrf == undefined) {
            req.session.csrf = nanoid(64);
        }

        if(req.session.data !== undefined) {
            req.session.data = [];
        }

        if(req.method == "GET" && req.header('x-api') == undefined || req.header('x-forceCache') === "true") {
            req.session.fileCache = {};
        }
        else if(req.method === "POST") {
            if(req.session.csrf !== req.header('X-CSRF-Token') && req.originalUrl !== '/api/cache/session') {
                res.status(403).send({ "error" : "Incorrect CSRF" });
            }
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
                    return;
                }
            }
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
let pages = await fsDirPromise('pages', false);
for(let key of pages) {
    if(key.name !== undefined && key.name !== '404.html') {
        let openPage = await getRoutes(key.name);
        let pageRoutes = openPage.routes;
        if(Array.isArray(pageRoutes) && pageRoutes.length > 0) {
            console.log(pageRoutes);
            app.get(pageRoutes, async (req, res, next) => {
                if(openPage.cache == true) {
                    req.cacheTerm = await md5(req.originalUrl + '-full-metal-alchemist');
                    if(req.originalUrl === '/') {
                        req.cacheTerm = md5('root-full-metal-alchemist');
                    }
                    req.cache = await client.get(`${req.cacheTerm}`);
                    const timerId = uuid();
                    if(req.method == "GET" && req.cache !== null && req.cache !== "" && req.header('x-forceCache') !== "true") {
                        console.time(`sent-by-cache-${timerId}`)
                        if(res.headersSent !== true) {
                            res.send(req.cache);
                        }
                        console.timeLog(`sent-by-cache-${timerId}`)
                    }
                }
                req.output = await createPage(key.name.split('.html')[0], req, openPage.headless);
                if(res.headersSent !== true) {
                    res.send(req.output);
                }
                next();
            });
        }
    }
}

// Configure all post routes
let posts = await fsDirPromise('post', false);
for(let key of posts) {
    if(key.name !== undefined) {
        let openPage = await getRoutes(key.name, true);
        let pageRoutes = openPage.routes;
        if(Array.isArray(pageRoutes) && pageRoutes.length > 0) {
            app.post(pageRoutes, jsonParser, async (req, res, next) => {
                req.output = await createPage(key.name.split('.html')[0], req, openPage.headless, true);
                if(res.headersSent !== true) {
                    res.send(req.output);
                }
            });
        }
    }
}
// *.controller.js files
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

app.post('/unsubscribe/:email', async (req, res, next) => {

    try {
        // Enclosed function which runs before the file is loaded
        let findEmail = await Subscription.find({ "email" : req.params.email || "" });
        if(findEmail.length > 0) {
            await Subscription.deleteOne({ "email" : req.params.email || "" });
            res.send({ "message" : "Email removed" })
        } 
        else {
            res.send({ "message" : "Email doesn't exist" })
        }
    }
    catch(e) {
        console.log(e);
    }
});

// I'm going back to 404
app.use(async (req, res, next) => {
    // If it's a seven hour flight or a 45 minute drive
    if(res.headersSent !== true && req.method == "GET" && req.header('x-forceCache') !== "true" && (req?.header('referrer')?.indexOf('sw.js') == -1 ||  req?.header('referrer')?.indexOf('sw.js') == undefined)) {
        let output = await createPage('404', req);
        if(res.headersSent !== true) {
            res.send(output);
        }
    }
    else if(res.headersSent !== true && req.method == "POST") {
        res.send({ "error" : "404 - that page was not found" })
    }
    else if(req.method == "GET" && res.headersSent !== true) {
        let output = await createPage('404', req);
        if(res.headersSent !== true) {
            res.send(output);
        }
    }
    next();
});

app.use(async (req, res, next) => {  
    if(req.method === "GET" || req.originalUrl === '/api/forceCache') {
        if(req.cacheTerm !== undefined && req.output !== undefined) {
            await client.set(req.cacheTerm, req.output);
        }
    }
})
// Hey.. Listen!
server.listen(port);