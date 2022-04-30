// author.api.js
import express from 'express'

// create application/json parser
const jsonParser = express.json()

// import model
import { Author } from '../models/author.model.js';
import { User } from '../models/user.model.js';
const authorApi = express.Router();

authorApi.post('/author', jsonParser, async function(req, res) {
    try {
        const requiredKeys = Object.keys(Author.schema.obj);
        if(requiredKeys.every(key => Object.keys(req.body).includes(key))) {
            let combineData = '';
            req.body.social.forEach(function(socialItem) {
                if(socialItem.socialType == 'twitter') {
                    combineData += `<a class="twitter" href="https://twitter.com/${i.username}">${i.username}</a>`
                }
                if(socialItem.socialType == 'github') {
                    combineData += `<a class="github" href="https://github.com/${i.username}">${i.username}</a>`
                }
            });
            req.body.socialHtml = combineData;
            const newAuthor = new Author(req.body);
            newAuthor.save(function (err) {
                if (err) {
                    return res.status(400).send({ "error" : err });
                } else {
                    return res.status(200).send({ "message" : "Author saved" })
                }
            });
        }
        else {
            return res.status(400).send({ "error" : `You are missing a key from your JSON. Check you have them all. You need at least ${JSON.stringify(requiredKeys)}` });
        }
    }  catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
});

authorApi.post('/author/delete', jsonParser, async (req, res) => {
    try {
        if(typeof req.body.name !== "undefined") {
            let findUser = await User.findOne({"name" : req.body.name});
            if(findUser == null) {
                return res.status(400).send({ "message" : "A user with that name doesn't exist!" })
            }
            else {
                await User.deleteOne({ "name" : req.body.name });
                return res.status(400).send({ "message" : "User deleted." })
            }
        }
        else {
            return res.status(400).send({ "error" : `You are missing a 'name' from your JSON. Please send JSON in this format: { "name" : "author-to-delete" }` });
        }
    }
    catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
})
export { authorApi }