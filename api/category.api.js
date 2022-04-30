// category.api.js
import express from 'express'

// create application/json parser
var jsonParser = express.json()

// Models
import { Category } from '../models/category.model.js';

// Router
const categoryApi = express.Router();

categoryApi.post('/category', jsonParser, async function(req, res) {
    try {
        const requiredKeys = Object.keys(Category.schema.obj);
        if(requiredKeys.every(key => Object.keys(req.body).includes(key))) {
            const newArticle = new Category(req.body);
            await newArticle.save(function (err) {
                if (err) {
                    return res.status(400).send(err);
                } else {
                    return res.status(200).send({ "message" : "Object saved" })
                }
            });
        }
        else {
            return res.status(400).send({ "error" : `You are missing a key from your JSON. Check you have them all. You need at least ${JSON.stringify(requiredKeys)}` });
        }
    } catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
});

categoryApi.post('/category/delete', jsonParser, async (req, res) => {
    try {
        if(typeof req.body.title !== "undefined") {
            let findCategory = await Category.findOne({"name" : req.body.title});
            if(findCategory == null) {
                return res.status(400).send({ "message" : "A category with that name doesn't exist!" })
            }
            else {
                await Category.deleteOne({ "name" : req.body.title });
                return res.status(400).send({ "message" : "Category deleted" })
            }
        }
        else {
            return res.status(400).send({ "error" : `You are missing a 'title' from your JSON. Please send JSON in this format: { "title" : "category-to-delete" }` });
        }
    } catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
})
export { categoryApi }