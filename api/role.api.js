// role.api.js
import express from 'express'

// create application/json parser
let jsonParser = express.json()

// Models
import { Role } from '../models/role.model.js';

const roleApi = express.Router();

roleApi.post('/role', jsonParser, async function(req, res) {
    try {
        const requiredKeys = Object.keys(Role.schema.obj);
        if(requiredKeys.every(key => requiredKeys.includes(key))) {
            let findRole = await Role.findOne({ role: `${req.body.role}` });
            if(findRole !== null) {
                Role.findOneAndUpdate({ role: `${req.body.role}` }, { importance: `${req.body.importance}` }, { upsert: true }, function(err, doc) {
                    if(err) return false;
                    res.status(200).send({ "message" : "Role updated!" })
                });
            }
            else {
                const newRole = new Role(req.body);
                newRole.save(function (err) {
                    if (err) {
                        return res.status(400).send({ "error" : err });
                    } else {
                        return res.status(200).send({ "message" : "Role Saved!" })
                    }
                });
            }
        } else {
            return res.status(400).send({ "error" : "Error occurred" });
        }
    }
    catch(e) {        
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
});

// Delete an article
roleApi.post('/role/delete', jsonParser, async function(req, res) {
    try {
        if(req.body.role !== undefined) {
            Role.findOneAndDelete({ role: `${req.body.role}` }, function(err, doc) {
                if (err) return res.status(500).send({ "error": err });
                return res.status(200).send({ "message" : "Role has been deleted" })
            });
        }
        else {
            return res.status(400).send({ "error" : `You are missing a role in your body. Please add { "role" : "role-to-delete" }` });
        }
    } catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
})
export { roleApi }