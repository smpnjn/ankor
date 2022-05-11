// quiz.api.js
import express from 'express'

// create application/json parser
var jsonParser = express.json()

// *.model.js
import { Quiz } from '../models/quiz.model.js';

const quizApi = express.Router();

quizApi.post('/quiz', jsonParser, async function(req, res) {
    try {
        const requiredKeys = Object.keys(Quiz.schema.obj);
        if(requiredKeys.every(key => Object.keys(req.body).includes(key))) {
            const newSeries = new Quiz(req.body);
            newSeries.save(async function (err) {
                if (err) {
                    return res.status(400).send(err);
                } else {
                    return res.status(200).send({ "message" : "Quiz saved" })
                }
            });
        } else {
            return res.status(400).send({ "error" : `You are missing a key from your JSON. Check you have them all. You need at least ${JSON.stringify(requiredKeys)}` });
        }
    } catch(e) {
        console.log(e);
    }
});

quizApi.post('/quiz/delete', jsonParser, async (req, res) => {
    try {
        if(typeof req.body.canonicalName !== "undefined") {
            let findQuiz = await Quiz.findOne({"canonicalName" : `${req.body.canonicalName}`});
            if(findQuiz == null) {
                return res.status(400).send({ "message" : "A quiz with that canonicalName doesn't exist!" })
            }
            else {
                await Quiz.deleteOne({ "canonicalName" : `${req.body.canonicalName}` });
                return res.status(400).send({ "message" : "Quiz deleted." })
            }
        }
    }
    catch(e) {
        console.log(e);        
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
})
export { quizApi };