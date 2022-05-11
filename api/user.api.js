// user.api.js
import express from 'express'
import { nanoid } from 'nanoid'

// create application/json parser
let jsonParser = express.json()

// Auth modules
import bcrypt from 'bcrypt'

// Models
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { Access } from '../models/access.model.js';
import { Subscription } from '../models/subscription.model.js';

const userApi = express.Router();

// Installation related variables - do not define the actual roles or access users have.
// If you are making your first user, these are added to your DB.
const defaultRoles = {
    "admin" : 9999,
    "root" : 9999,
    "writer" : 1,
    "contributor" : 2
}

const defaultAccess = {
    "access" : 9999,
    "article" : 1,
    "author" : 1,
    "cache" : 0,
    "load-posts" : 0,
    "category" : 2,
    "image" : 1,
    "quiz" : 2,
    "role" : 999,
    "series" : 2,
    "token" : 9999,
    "user" : 999
}

userApi.post('/user', jsonParser, async function(req, res) {
        try {
            const requiredKeys = Object.keys(User.schema.obj);

            requiredKeys.forEach(function(item, index) {
                if(item == 'apiKey') {
                    requiredKeys.splice(index, 1);
                }
            });

            // Find user count
            const findUser = await User.find();
            // Create default admin and root roles, and access levels
            if(findUser.length === 0) {
                Object.keys(defaultRoles).forEach(async function(item) {
                    let createRole = new Role({ role: item, importance: defaultRoles[item] })
                    await Role.save(createRole);
                });
                Object.keys(defaultAccess).forEach(async function(item) {
                    let createAccess = new Access({ role: item, importance: defaultAccess[item] })
                    await Access.save(createAccess);
                });
            }

            const getRole = await Role.findOne({ role: `${req.body.role}` });
            if(getRole === null) {
                return res.status(400).send({ "error" : "Role does not exist" });
            }

            if(requiredKeys.every(key => requiredKeys.includes(key))) {
                bcrypt.hash(req.body.password, 15, function(err, hash) {
                    req.body.password = hash;
                    req.body.apiKey = nanoid(26);
                    const newUser = new User(req.body);
                    newUser.save(function (err) {
                        if (err) {
                            return res.status(400).send(err);
                        } else {
                            return res.status(200).send({ "message" : `Object saved, API Key is ${req.body.apiKey}` })
                        }
                    });
                });
            } else {
                return res.status(400).send({ "error" : `You are missing a key from your JSON. Check you have them all. You need at least ${JSON.stringify(requiredKeys)}` });
            }
        }
        catch(e) {
            console.log(e);
            return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
        }
});

userApi.post('/user/delete/', jsonParser, async (req, res) => {
    try {
        if(typeof req.body.username !== "undefined") {
            let findUser = await User.findOne({ username: `${req.body.username}` });
            if(findUser == null) {
                return res.status(200).send({ "message" : "No user with that username exists" })
            }
            try {
                User.findOneAndDelete({ username: `${req.body.username}` }, function(err, doc) {
                    if (err) return res.send(500, { "error": err });
                    return res.status(200).send({ "message" : "User Deleted" })
                });
            } catch(e) {
                console.log(e);
            }
        } else {
            return res.status(400).send({ "error" : `You are missing a 'username' from your JSON. Please send JSON in this format: { "username" : "username-to-delete" }` });
        }
    } 
    catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
});

userApi.post('/subscribe', jsonParser, async function(req, res) {
    try {
        let validateEmail = function(email) {
            const regex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            return regex.test(email);
        }
        let checkSubscription = await Subscription.find({ 'email' : `${req.body.email}` });
        if(checkSubscription.length === 0) {
            if(validateEmail(req.body.email)) {
                const newSubscription = new Subscription({
                    email: req.body.email,
                });
                newSubscription.save(function(err) {
                    if(err) {
                        res.status(400).send({ "error" : "Error saving your email.", "response" : false });
                    } else {
                        res.status(200).send({ "message" : "User has subscribed.", "response" : true  });
                    }
                })
            } else {
                res.status(400).send({ "error" : "Error saving your email.", "response" : false });
            }
        } else {
            res.status(201).send({ "message" : "User Already Subscribed.", "response" : true  });
        }
    } catch(e) {
        console.log(e);
    }
});

export { userApi } 