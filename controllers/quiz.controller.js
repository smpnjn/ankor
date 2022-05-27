// quiz.controller.js
import express from 'express'
import { createPage } from '../util.js'

// *.model.js
import { Quiz } from '../models/quiz.model.js';
import { Article } from '../models/article.model.js';

const quizRouter = express.Router();

// Can be transferred to Vue.JS
quizRouter.get('/quiz/:quizName', async function(req, res, next) {
    try {
        let quiz = await Quiz.findOne({ 'canonicalName' : req.params.quizName }).lean();
        let quizData = Object.assign({}, quiz);
        if(quizData !== null) {
            // Change URL to base directory if no associated article is found
            let article = await Article.findOne({ 'canonicalName': quizData.associatedCanonical }).lean();
            if(article !== null) {
                quizData.associatedCanonical = `/series/${article.series}`
            }
            else {
                quizData.associatedCanonical = '/';
            }
            req.output = await createPage('quiz.page.html', {
                ...quizData,
                totalQuestions : quizData.questions.length,
            }, {
                article: article
            }, {
                title: quizData.title,
                description: quizData.description,
                canonical: `${process.env.rootUrl}quiz/${quizData.canonicalName}`
            }, req);
            if(res.headersSent !== true) {
                res.send(req.output);
            }
            next();
        }
        else {
            next();
        }
    } catch(e) {
        console.log(e);
        next();
    }
});


export { quizRouter };