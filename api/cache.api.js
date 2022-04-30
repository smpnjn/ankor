import express from 'express';
import fetch from 'node-fetch';
import { createClient } from 'redis'

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
                    if(cacheTerm === '/') {
                        req.cacheTerm = 'root'
                    }
                    else {
                        req.cacheTerm = cacheTerm;
                    }
                    
                    let getHtml = await fetch(req.body.url, {
                        method: "GET",
                        headers: {
                            "x-forceCache" : true
                        }
                    })
                    let response = await getHtml.text();
                    // Redis connection
                    await client.set(`${req.cacheTerm}`, response);
                    return res.status(200).send({ "message" : "Recached URL", "url" : cacheTerm });
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

export { cacheApi }