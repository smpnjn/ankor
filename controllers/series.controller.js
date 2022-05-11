// series.controller.js
import express from 'express'
import { promises as fs } from 'fs'
import { createPage, fsPromise } from '../util.js'


// *.view.js
import { seriesStructure } from '../views/series.view.js';

// *.model.js
import { Series } from '../models/series.model.js';
import { Quiz } from '../models/quiz.model.js';

const seriesRouter = express.Router();

// Can be transferred to Vue.JS
seriesRouter.get([ '/course/:guideName', '/series/:guideName' ], async function(req, res, next) {
    try {
        let series = await Series.findOne({ 'canonicalName' : req.params.guideName }).lean();
        let seriesData = Object.assign({}, series);
        if(seriesData !== null && seriesData.seriesPage == true) {
            let calculateTime = 0; 
            for(let i = 0; i < seriesData.seriesItems.length; ++ i) {
                try {
                    if(seriesData.seriesItems[i].canonicalName !== undefined) {
                        let file = await fsPromise(`./documents/${seriesData.seriesItems[i].canonicalName}.html`, 'utf8');
                        let splitFile = file.split(' ').length / 200;
                        calculateTime += Math.ceil(splitFile); 
                    }
                    let quiz = await Quiz.findOne({ associatedCanonical: seriesData.seriesItems[i].canonicalName }).lean();
                    let quizData = Object.assign({}, quiz);
                    if(Object.keys(quizData).length !== 0) {
                        quizData.length = quizData.questions.length
                    }
                    else {
                        quizData = null
                    }
                    seriesData.seriesItems[i].quiz = quizData;
                }
                catch(e) {
                    //console.log(e);
                }
            }
            
            seriesData.seriesSections = [];
            for(let x in seriesData.seriesItems) {
                if(seriesData.seriesSections.filter((y) => y.title == `${seriesData.seriesItems[x].subArea}`).length == 0) {
                    seriesData.seriesSections.push({ title: seriesData.seriesItems[x].subArea, seriesItems: [] });
                }
                let thisSeries = seriesData.seriesSections.filter((y) => y.title == `${seriesData.seriesItems[x].subArea}`)[0];             
                thisSeries.seriesItems.push(seriesData.seriesItems[x]);
            }

            let hours = (calculateTime > 0) ? Math.floor(calculateTime / 60) : 0;
            let mins = (calculateTime > 0) ? Math.ceil((calculateTime - (60 * hours)) / 15) * 15 : 0;

            hours = (isNaN(hours)) ? 0 : hours;
            mins = (isNaN(mins)) ? 0 : mins;

            if(mins === 60) {
                mins = 0;
                hours += 1;
            }
            
            req.output = await createPage('series.page.html', {
                ...seriesData,
                hours: `${hours}`,
                mins: `${mins}`,
                more: await seriesStructure.generateMore(),
            }, {
                series: seriesData
            }, {
                title: seriesData.title,
                classes: "series",
                description: seriesData.description,
                canonical: `${process.env.rootUrl}/course/${seriesData.canonicalName}`,
            }, req);
            
            if(res.headersSent !== true) {
                res.send(req.output);
            }
            next();
        } else {
            next();
        }
    } catch(e) {
        console.log(e);
        next();
    }
});

export { seriesRouter };