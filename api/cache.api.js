import express from 'express';
import fetch from 'node-fetch';
import { createClient } from 'redis'
import path from 'path'
import { nanoid } from "nanoid";
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Index.js
import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '.env') });

// Redis Connection
const client = createClient();
client.on('error', (err) => console.log('Redis Client Error', err));
await client.connect();

let cacheApi = express.Router();


cacheApi.post('/cache', async (req, res, next) => {
    try {
        if(typeof req.body == "object" && typeof req.body.url !== "undefined") {
            try {
                let getUrl = req.body.url.split(process.env.rootUrl.slice(0, -1));
                if(getUrl.length > 1) {
                    let cacheTerm = getUrl[1];
                    if(cacheTerm.href === process.env.rootUrl) {
                        console.log('hey ho');
                    }
                    if(cacheTerm === '/') {
                        req.cacheTerm = 'root'
                    }
                    else {
                        req.cacheTerm = cacheTerm;
                    }
                    
                    let checkUrl = url.parse(req.body.url);
                    if((checkUrl.protocol + '//' + checkUrl.host + '/') === process.env.rootUrl) {
                        let getHtml = await fetch(process.env.rootUrl.slice(0, -1) + checkUrl.path, {
                            method: "GET",
                            headers: {
                                "x-forceCache" : true
                            }
                        })
                        let response = await getHtml.text();
                        // Redis connection
                        return res.status(200).send({ "message" : "Recached URL", "url" : cacheTerm });
                    }
                    else {
                        return res.status(400).send({ "error" : "Invalid URL" });
                    }
                }
                else {
                    return res.status(400).send({ "error" : "Invalid cache URL" })
                }
            }
            catch(e) {
                console.log(e);
            }
        }
    }
    catch(e) {
        console.log(e);
    }
});

cacheApi.post('/cache/session', (req, res, next) => {
    try {
        if(req.session == undefined) {
            req.session = {};
        }
        if(req.session.csrf == undefined) {
            req.session.csrf = nanoid(64);
        }
        if(req.session.csrf !== undefined) {
            return res.status(200).send({ "csrf" : req.session.csrf })
        }
    }
    catch(e) {
        console.log(e);
    }
})
export { cacheApi }