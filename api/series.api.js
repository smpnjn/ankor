// series.api.js
import express from 'express'

// create application/json parser
var jsonParser = express.json()

// Models
import { Series } from '../models/series.model.js';
import { Article } from '../models/article.model.js';

const seriesApi = express.Router();

seriesApi.post('/series/add/:seriesName', jsonParser, async function(req, res) {
    try {
        if(typeof req.params.seriesName === "undefined") {
            return res.status(400).send({ "error" : "You have not listed a seriesName in your call. Please call the route as /series/add/:seriesName" });            
        }
        if(!Array.isArray(req.body)) {
            return res.status(400).send({ "error" : "The body of your request should be an array [] of objects you wish to add to your series" });            
        }
        let failedObjects = [];
        let requiredKeys = [ 'title', 'description', 'subArea', 'canonicalName', 'icon' ]
        let succeededObjects = [];
        req.body.forEach((i, index) => {
            const hasAllKeys = requiredKeys.every(j => i.hasOwnProperty(j));
            if(hasAllKeys) {
                succeededObjects.push(i);
            }
            else {
                failedObjects.push(index);
            }
        });
        
        const findSeries = Series.findOne({ canonicalName: `${req.params.seriesName}` }, async function(err, series) {
            if(findSeries !== null) {
                let findSeriesItems = series.seriesItems;
                findSeriesItems = [ ...findSeriesItems, ...succeededObjects ]
                
                Series.findOneAndUpdate({ canonicalName: `${req.params.seriesName}` }, { seriesItems: findSeriesItems }, { upsert: true }, function(err, doc) {
                    if (err) {
                        return res.status(400).send({ "error" : err });
                    } else {
                        let message = { "message" : "Object saved" }
                        if(failedObjects.length > 0) {
                            message["error"] = `Items with the indexes listed in "failedObjects" in your array could not be added, as they were missing properties. The required properties are: ${JSON.stringify(requiredKeys)}`
                            message["failedObjects"] = `${JSON.stringify(requiredKeys)}`;
                        }
                        return res.status(200).send(message)
                    }
                });
            }
            else {
                return res.status(400).send({ "error" : "The :seriesName you provided does not exist." });            
            }
        });
    } catch(e) {
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
        console.log(e);
    }
});

seriesApi.post('/series', jsonParser, async function(req, res) {
    try {
        if(typeof req.body.date == "undefined") {
            req.body.date = Date.now();
        }      
        const requiredKeys = Object.keys(Series.schema.obj);
        let newSeries = [];
        let missingSeries = [];
        if(typeof req.body.seriesItems == "object") {
            for(let k in Object.keys(req.body.seriesItems)) {
                let item = Object.keys(req.body.seriesItems)[k];
                if(Array.isArray(req.body.seriesItems[`${item}`])) {
                    for(let j in req.body.seriesItems[`${item}`]) { 
                        let arrItem = req.body.seriesItems[`${item}`][j];
                        let findArticle = await Article.findOne({ canonicalName: arrItem });
                        if(findArticle !== null) {
                            newSeries.push({
                                title: `${findArticle.titles[0].title}`,
                                icon: `${findArticle.icon}` || "",
                                subArea: `${item}` || "Content",
                                description: `${findArticle.shortDescription}`,
                                canonicalName: arrItem
                            });
                            await Article.findOneAndUpdate({ canonicalName: arrItem }, { series: `${req.body.canonicalName}` }, { upsert: true })
                        }
                        else {
                            missingSeries.push(arrItem)
                        }
                    }
                }
            }
        }
        req.body.seriesItems = newSeries;
        if(requiredKeys.every(key => Object.keys(req.body).includes(key))) {
            const newSeries = new Series(req.body);
            newSeries.save(async function (err) {
                if (err) {
                    return res.status(400).send(err);
                } else {
                    return res.status(200).send({ "message" : "Object saved", "incorrectCanonicalNames" : missingSeries })
                }
            });
        } else {
            return res.status(400).send({ "error" : `You are missing a key from your JSON. Check you have them all. You need at least ${JSON.stringify(requiredKeys)}`, "incorrectCanonicalNames" : missingSeries });
        }
    } catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
});

seriesApi.post('/series/delete/', async (req, res) => {
    try {
        if(req.body.canonicalName !== "undefined") {
            try {
                Series.findOneAndDelete({ canonicalName: req.body.canonicalName }, function(err, doc) {
                    if (err) return res.send(500, { "error": err });
                    return res.status(200).send({ "message" : "Object Deleted" })
                });
            } catch(e) {
                console.log(e);
                return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
            }
        } else {
            return res.status(400).send({ "error" : `You are missing a 'canonicalName' from your JSON. Please send JSON in this format: { "canonicalName" : "series-to-delete" }` });
        }
    } catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
});

export { seriesApi }