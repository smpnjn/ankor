// series.api.js
import express from 'express'

// create application/json parser
var jsonParser = express.json()

// Models
import { Article } from '../models/article.model.js';
import { Series } from '../models/series.model.js';

const seriesApi = express.Router();

seriesApi.post('/series/add/:seriesName', jsonParser, async function(req, res) {
    try {
        if(typeof req.params.seriesName === "undefined") {
            return res.status(400).send({ "error" : "You have not listed a seriesName in your call. Please call the route as /series/add/:seriesName" });            
        }
        if(!Array.isArray(req.body)) {
            return res.status(400).send({ "error" : "The body of your request should be an array [] of canonicalNames for the articles you wish to add to your series" });            
        }
        if(req.body.positions.length !== req.body.items.length) {
            return res.status(400).send({ "error" : "Please use the same number of items as positions. Your request body should contain { items: 'canonical-names', positions: [1] }" });            
        }
        let failedObjects = [];
        let succeededObjects = [];
        if(Array.isArray(req.body.items)) {
            for(let i of req.body.items) {
                let thisArticle = await Article.findOne({ canonicalName: { $eq: `${i}` } });
                if(thisArticle !== null) {
                    succeededObjects.push(thisArticle._id);
                } 
                else {
                    failedOsucceededObjectsbjects.push(null);
                }
            }
            req.body.items = succeededObjects;
        }
        
        Series.findOne({ canonicalName: `${req.params.seriesName}` }, async function(err, series) {
            if(findSeries !== null) {
                for(let i of req.body.positions) {
                    if(req.body.items[i] !== null) {
                        findSeriesItems.splice(i, 0, req.body.items[i]);
                    }
                }
                Series.findOneAndUpdate({ canonicalName: `${req.params.seriesName}` }, { items: findSeriesItems }, { upsert: true }, function(err, doc) {
                    if (err) {
                        return res.status(400).send({ "error" : err });
                    } else {
                        let message = { "message" : "Object saved" }
                        if(failedObjects.length > 0) {
                            message["error"] = `Items with the indexes listed in "failedObjects" in your array could not be added, since articles could not be found with their "canonicalName"s`
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
        let failedObjects = [];
        let succeededObjects = [];
        if(Array.isArray(req.body.items)) {

            for(let i of req.body.items) {
                let thisArticle = await Article.findOne({ canonicalName: { $eq:  i } });
                if(thisArticle !== null) {
                    succeededObjects.push(thisArticle._id);
                } 
                else {
                    failedObjects.push(i);
                }
            }

            req.body.items = succeededObjects;
        }

        if(requiredKeys.every(key => Object.keys(req.body).includes(key))) {
            const newSeries = new Series(req.body);
            newSeries.save(async function (err) {
                if (err) {
                    return res.status(400).send(err);
                } else {
                    if(failedObjects.length > 0) {
                        return res.status(200).send({ "message" : "Object saved. Some articles couldn't be found as their 'canonicalName's don't exist.", "incorrectCanonicalNames" : failedObjects })
                    }
                    else {
                        return res.status(200).send({ "message" : "Object saved." })
                    }
                }
            });
        } else {
            return res.status(400).send({ "error" : `You are missing a key from your JSON. Check you have them all. You need at least ${JSON.stringify(requiredKeys)}` });
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
                Series.findOneAndDelete({ canonicalName: `${req.body.canonicalName}` }, function(err, doc) {
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