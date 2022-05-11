// access.api.js
import express from 'express'

// create application/json parser
let jsonParser = express.json()

// Models
import { Access } from '../models/access.model.js';

const accessApi = express.Router();

accessApi.post('/access', jsonParser, async function(req, res) {
    try {
        const requiredKeys = Object.keys(Access.schema.obj);
        if(requiredKeys.every(key => requiredKeys.includes(key))) {
            let findApi = await Access.findOne({ api: `${req.body.api}` });
            if(findApi !== null) {
                Access.findOneAndUpdate({ api: `${req.body.api}` }, { accessLevel: `${req.body.accessLevel}` }, { upsert: true }, function(err, doc) {
                    if(err) return false;
                    res.status(200).send({ "message" : "API Access Level Updated!" })
                });
            }
            else {
                const newAccess = new Access(req.body);
                newAccess.save(function (err) {
                    if (err) {
                        return res.status(400).send(err);
                    } else {
                        return res.status(200).send({ "message" : "Access Settings Saved!" })
                    }
                });
            }
        } else {
            return res.status(400).send({ "error" : `You are missing a key from your JSON. Check you have them all. You need at least ${JSON.stringify(requiredKeys)}` });
        }
    }
    catch(e) {
        console.log(e);
    }
});

export { accessApi }